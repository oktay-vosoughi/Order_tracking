'use strict';
// İhale (tender) goods entry: stock that arrives through a tender has no purchase
// request, so it is recorded here and lands directly in a department's LOT stock.
// Only ADMIN and SATINAL_LOJISTIK may use it.

const { samePool } = require('./sharedStockPool.cjs');

const ALLOWED_ROLES = new Set(['ADMIN', 'SATINAL_LOJISTIK']);
const tenderRoleRequired = (req, res, next) => {
  if (ALLOWED_ROLES.has(req.user?.role)) return next();
  return res.status(403).json({ error: 'FORBIDDEN', message: 'İhale girişi yalnızca Admin ve Satın Alma Lojistik içindir.' });
};

const ensureTenderReceiptsTable = (pool) => pool.query(`CREATE TABLE IF NOT EXISTS tender_receipts (
  id VARCHAR(64) NOT NULL,
  tenderNo VARCHAR(100) NULL,
  itemId VARCHAR(64) NOT NULL,
  itemCode VARCHAR(100) NULL,
  itemName VARCHAR(255) NULL,
  department VARCHAR(100) NOT NULL,
  quantity DECIMAL(14,2) NOT NULL,
  lotNumber VARCHAR(100) NOT NULL,
  lotId VARCHAR(64) NULL,
  expiryDate DATE NULL,
  supplierFirmName VARCHAR(255) NULL,
  invoiceNo VARCHAR(255) NULL,
  unitPrice DECIMAL(12,4) NULL,
  attachmentUrl MEDIUMTEXT NULL,
  attachmentName VARCHAR(255) NULL,
  notes TEXT NULL,
  receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(100) NULL,
  PRIMARY KEY (id),
  INDEX idx_tender_item (itemId),
  INDEX idx_tender_no (tenderNo),
  INDEX idx_tender_received (receivedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

const text = (value, max) => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
};

function registerTenderReceipts(app, { pool, all, run, withTransaction, generateId, authRequired, isCanonicalDepartment }) {
  app.post('/api/tender-receipts', authRequired, tenderRoleRequired, async (req, res) => {
    const body = req.body || {};
    const quantity = Number(body.quantity);
    const lotNumber = text(body.lotNumber, 100);
    const expiryDate = text(body.expiryDate, 10);
    const unitPriceRaw = body.unitPrice === '' || body.unitPrice == null ? null : Number(body.unitPrice);
    if (!body.itemId || !lotNumber || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Malzeme, miktar ve LOT no zorunludur.' });
    }
    if (!isCanonicalDepartment(body.department)) {
      return res.status(400).json({ error: 'INVALID_DEPARTMENT', message: 'Geçerli bir bölüm seçin.' });
    }
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || Number.isNaN(Date.parse(expiryDate))) {
      return res.status(400).json({ error: 'INVALID_EXPIRY', message: 'Son kullanma tarihi (SKT) zorunludur.' });
    }
    if (unitPriceRaw !== null && (!Number.isFinite(unitPriceRaw) || unitPriceRaw < 0)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Birim fiyat geçersiz.' });
    }

    try {
      const record = await withTransaction(async (conn) => {
        const items = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [body.itemId]);
        if (!items.length) throw { status: 404, error: 'ITEM_NOT_FOUND', message: 'Malzeme bulunamadı.' };
        const item = items[0];

        const id = generateId();
        const tenderNo = text(body.tenderNo, 100);
        const notes = text(body.notes, 2000);
        const existing = await all(conn, 'SELECT * FROM lots WHERE itemId = ? AND lotNumber = ? FOR UPDATE', [item.id, lotNumber]);
        let lotId;
        if (existing.length) {
          const lot = existing[0];
          if (lot.department && lot.department !== body.department && !samePool(lot.department, body.department)) {
            throw { status: 409, error: 'LOT_DEPARTMENT_MISMATCH', message: 'Bu LOT numarası başka bir bölümün stoğunda kayıtlı.' };
          }
          lotId = lot.id;
          await run(conn, `UPDATE lots SET currentQuantity = currentQuantity + ?, initialQuantity = initialQuantity + ?,
            status = 'ACTIVE', updatedBy = ? WHERE id = ?`, [quantity, quantity, req.user.username, lotId]);
        } else {
          lotId = generateId();
          await run(conn, `INSERT INTO lots (id, itemId, receiptId, lotNumber, expiryDate, receivedDate, initialQuantity,
            currentQuantity, department, invoiceNo, attachmentUrl, attachmentName, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lotId, item.id, id, lotNumber, expiryDate, quantity, quantity, body.department, text(body.invoiceNo, 255) || '',
            body.attachmentUrl || '', text(body.attachmentName, 255) || '', `İhale${tenderNo ? ` ${tenderNo}` : ''}${notes ? ` | ${notes}` : ''}`.slice(0, 1000), req.user.username]);
        }

        await run(conn, `INSERT INTO tender_receipts (id, tenderNo, itemId, itemCode, itemName, department, quantity, lotNumber,
          lotId, expiryDate, supplierFirmName, invoiceNo, unitPrice, attachmentUrl, attachmentName, notes, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenderNo, item.id, item.code, item.name, body.department, quantity, lotNumber, lotId, expiryDate,
          text(body.supplierFirmName, 255), text(body.invoiceNo, 255), unitPriceRaw, body.attachmentUrl || null,
          text(body.attachmentName, 255), notes, req.user.username]);

        const unitsPerPackage = Number(item.unitsPerPackage) > 0 ? Number(item.unitsPerPackage) : 1;
        await run(conn, `INSERT INTO stock_movements (id, movementType, itemId, fromLocation, toLocation, packQty, unitQty,
          performedByUserId, performedByUsername, department, refId, notes)
          VALUES (?, 'RECEIVE_GOODS', ?, 'SUPPLIER', 'MAIN_DEPOT', ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), item.id, quantity, quantity * unitsPerPackage, req.user.id, req.user.username, body.department, id,
          `İhale${tenderNo ? ` ${tenderNo}` : ''} | Lot: ${lotNumber} | SKT: ${expiryDate}`.slice(0, 1000)]);

        const rows = await all(conn, `SELECT id, tenderNo, itemId, itemCode, itemName, department, quantity, lotNumber, expiryDate,
          supplierFirmName, invoiceNo, unitPrice, attachmentName, notes, receivedAt, createdBy FROM tender_receipts WHERE id = ?`, [id]);
        return rows[0];
      });
      res.json({ receipt: record });
    } catch (error) {
      if (error?.status) return res.status(error.status).json({ error: error.error, message: error.message });
      console.error('Tender receipt error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // List (attachment payloads are left out; fetch one with GET /:id/attachment).
  app.get('/api/tender-receipts', authRequired, tenderRoleRequired, async (req, res) => {
    try {
      const where = [];
      const params = [];
      if (req.query.tenderNo) { where.push('tenderNo LIKE ?'); params.push(`%${String(req.query.tenderNo).trim()}%`); }
      if (req.query.itemId) { where.push('itemId = ?'); params.push(String(req.query.itemId)); }
      if (req.query.department) { where.push('department = ?'); params.push(String(req.query.department)); }
      const receipts = await all(pool, `SELECT id, tenderNo, itemId, itemCode, itemName, department, quantity, lotNumber, expiryDate,
        supplierFirmName, invoiceNo, unitPrice, attachmentName, (attachmentUrl IS NOT NULL AND attachmentUrl <> '') AS hasAttachment,
        notes, receivedAt, createdBy FROM tender_receipts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY receivedAt DESC LIMIT 2000`, params);
      res.json({ receipts });
    } catch (error) {
      console.error('Tender receipts list error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.get('/api/tender-receipts/:id/attachment', authRequired, tenderRoleRequired, async (req, res) => {
    try {
      const rows = await all(pool, 'SELECT attachmentUrl, attachmentName FROM tender_receipts WHERE id = ?', [req.params.id]);
      if (!rows.length || !rows[0].attachmentUrl) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json({ attachmentUrl: rows[0].attachmentUrl, attachmentName: rows[0].attachmentName });
    } catch (error) {
      console.error('Tender attachment error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });
}

module.exports = { registerTenderReceipts, ensureTenderReceiptsTable, tenderRoleRequired };
