const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'lab-equipment.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

const loadSchema = () => {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('Failed to load schema', err);
    } else {
      console.log('Database schema ready');
    }
  });
};

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) {
      reject(err);
    } else {
      resolve(this);
    }
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
    } else {
      resolve(rows);
    }
  });
});

const withTransaction = async (callback) => {
  await run('BEGIN');
  try {
    await callback();
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
};

const buildStateResponse = async () => {
  const [items, purchases, receipts, distributions] = await Promise.all([
    all('SELECT * FROM items ORDER BY createdAt ASC'),
    all('SELECT * FROM purchases ORDER BY requestedAt ASC'),
    all('SELECT * FROM receipts ORDER BY receivedAt ASC'),
    all('SELECT * FROM distributions ORDER BY distributedDate ASC')
  ]);

  const receiptsByPurchase = receipts.reduce((acc, r) => {
    if (!acc[r.purchaseId]) acc[r.purchaseId] = [];
    acc[r.purchaseId].push({
      receiptId: r.receiptId,
      receivedAt: r.receivedAt,
      receivedBy: r.receivedBy,
      receivedQty: r.receivedQty,
      lotNo: r.lotNo,
      expiryDate: r.expiryDate,
      invoiceNo: r.invoiceNo
    });
    return acc;
  }, {});

  const purchasesWithReceipts = purchases.map((p) => ({
    ...p,
    receipts: receiptsByPurchase[p.id] || []
  }));

  return { items, purchases: purchasesWithReceipts, distributions };
};

loadSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/state', async (_req, res) => {
  try {
    const payload = await buildStateResponse();
    res.json(payload);
  } catch (error) {
    console.error('Failed to read state', error);
    res.status(500).json({ error: 'Failed to read state' });
  }
});

app.post('/api/state', async (req, res) => {
  const { items = [], purchases = [], distributions = [] } = req.body || {};
  try {
    await withTransaction(async () => {
      await run('DELETE FROM receipts');
      await run('DELETE FROM purchases');
      await run('DELETE FROM distributions');
      await run('DELETE FROM items');

      for (const item of items) {
        await run(
          `INSERT INTO items (
            id, code, name, category, unit, minStock, currentStock, location, supplier, catalogNo, lotNo, brand, storageLocation, status, createdAt, createdBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            item.id,
            item.code,
            item.name,
            item.category || '',
            item.unit || '',
            item.minStock ?? 0,
            item.currentStock ?? 0,
            item.location || '',
            item.supplier || '',
            item.catalogNo || '',
            item.lotNo || '',
            item.brand || '',
            item.storageLocation || '',
            item.status || '',
            item.createdAt || null,
            item.createdBy || ''
          ]
        );
      }

      for (const p of purchases) {
        await run(
          `INSERT INTO purchases (
            id, requestNumber, itemId, itemCode, itemName, requestedQty, requestedBy, requestedAt, requestDate, status, approvedBy, approvedAt, approvedDate, approvalNote,
            orderedBy, orderedAt, supplierName, poNumber, orderedQty, receivedQtyTotal, receivedQty, receivedBy, receivedDate, lotNo, expiryDate, distributorCompany, notes, urgency, rejectionReason, rejectedBy, rejectedDate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            p.id,
            p.requestNumber || null,
            p.itemId,
            p.itemCode || '',
            p.itemName || '',
            p.requestedQty ?? 0,
            p.requestedBy || '',
            p.requestedAt || null,
            p.requestDate || null,
            p.status || '',
            p.approvedBy || '',
            p.approvedAt || null,
            p.approvedDate || null,
            p.approvalNote || '',
            p.orderedBy || '',
            p.orderedAt || null,
            p.supplierName || '',
            p.poNumber || '',
            p.orderedQty ?? 0,
            p.receivedQtyTotal ?? 0,
            p.receivedQty ?? 0,
            p.receivedBy || '',
            p.receivedDate || null,
            p.lotNo || '',
            p.expiryDate || '',
            p.distributorCompany || '',
            p.notes || '',
            p.urgency || '',
            p.rejectionReason || '',
            p.rejectedBy || '',
            p.rejectedDate || null
          ]
        );

        if (p.receipts && Array.isArray(p.receipts)) {
          for (const r of p.receipts) {
            await run(
              `INSERT INTO receipts (receiptId, purchaseId, receivedAt, receivedBy, receivedQty, lotNo, expiryDate, invoiceNo)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              , [
                r.receiptId,
                p.id,
                r.receivedAt || null,
                r.receivedBy || '',
                r.receivedQty ?? 0,
                r.lotNo || '',
                r.expiryDate || '',
                r.invoiceNo || ''
              ]
            );
          }
        }
      }

      for (const d of distributions) {
        await run(
          `INSERT INTO distributions (
            id, itemId, itemCode, itemName, quantity, distributedBy, distributedDate, receivedBy, purpose, completedDate, completedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            d.id,
            d.itemId,
            d.itemCode || '',
            d.itemName || '',
            d.quantity ?? 0,
            d.distributedBy || '',
            d.distributedDate || null,
            d.receivedBy || '',
            d.purpose || '',
            d.completedDate || null,
            d.completedBy || ''
          ]
        );
      }
    });

    res.json({ status: 'saved' });
  } catch (error) {
    console.error('Failed to persist state', error);
    res.status(500).json({ error: 'Failed to persist state' });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
