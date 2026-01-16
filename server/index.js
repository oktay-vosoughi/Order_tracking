const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 4000;

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'order_Tracking';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const all = async (connOrPool, sql, params = []) => {
  const [rows] = await connOrPool.query(sql, params);
  return rows;
};

const run = async (connOrPool, sql, params = []) => {
  const [result] = await connOrPool.execute(sql, params);
  return result;
};

const withTransaction = async (callback) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const ensureUsersTable = async () => {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(100) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdBy VARCHAR(100) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );
};

const authRequired = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED' });
  }
};

const adminRequired = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN' });
    return;
  }
  next();
};

const countUsers = async () => {
  const rows = await all(pool, 'SELECT COUNT(*) AS cnt FROM users');
  return Number(rows?.[0]?.cnt || 0);
};

const countAdmins = async () => {
  const rows = await all(pool, "SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN'");
  return Number(rows?.[0]?.cnt || 0);
};

const sanitizeUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  createdAt: u.createdAt,
  createdBy: u.createdBy
});

const buildStateResponse = async () => {
  const [items, purchases, receipts, distributions, wasteRecords] = await Promise.all([
    all(pool, 'SELECT * FROM items ORDER BY createdAt ASC'),
    all(pool, 'SELECT * FROM purchases ORDER BY requestedAt ASC'),
    all(pool, 'SELECT * FROM receipts ORDER BY receivedAt ASC'),
    all(pool, 'SELECT * FROM distributions ORDER BY distributedDate ASC'),
    all(pool, 'SELECT * FROM waste_records ORDER BY disposedDate ASC')
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
      invoiceNo: r.invoiceNo,
      attachmentUrl: r.attachmentUrl,
      attachmentName: r.attachmentName
    });
    return acc;
  }, {});

  const purchasesWithReceipts = purchases.map((p) => ({
    ...p,
    receipts: receiptsByPurchase[p.id] || []
  }));

  return { items, purchases: purchasesWithReceipts, distributions, wasteRecords };
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/bootstrap', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'INVALID_INPUT' });
    return;
  }

  try {
    const adminCount = await countAdmins();
    if (adminCount > 0) {
      res.status(409).json({ error: 'BOOTSTRAP_NOT_ALLOWED' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    await run(pool, 'INSERT INTO users (username, passwordHash, role, createdBy) VALUES (?, ?, ?, ?)', [String(username), passwordHash, 'ADMIN', String(username)]);
    const rows = await all(pool, 'SELECT * FROM users WHERE username = ?', [String(username)]);
    const user = rows?.[0];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Bootstrap error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'INVALID_INPUT' });
    return;
  }

  try {
    const existingCount = await countUsers();
    if (existingCount === 0) {
      res.status(409).json({ error: 'NO_USERS' });
      return;
    }

    const rows = await all(pool, 'SELECT * FROM users WHERE username = ?', [String(username)]);
    const user = rows?.[0];
    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }

    const ok = await bcrypt.compare(String(password), String(user.passwordHash));
    if (!ok) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const rows = await all(pool, 'SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows?.[0];
    if (!user) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Me error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const users = await all(pool, 'SELECT id, username, role, createdAt, createdBy FROM users ORDER BY createdAt DESC');
    res.json({ users });
  } catch (error) {
    console.error('List users error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/users', authRequired, adminRequired, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    res.status(400).json({ error: 'INVALID_INPUT' });
    return;
  }
  if (role !== 'REQUESTER' && role !== 'APPROVER') {
    res.status(400).json({ error: 'INVALID_ROLE' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), 10);
    await run(pool, 'INSERT INTO users (username, passwordHash, role, createdBy) VALUES (?, ?, ?, ?)', [String(username), passwordHash, String(role), String(req.user.username)]);
    const users = await all(pool, 'SELECT id, username, role, createdAt, createdBy FROM users ORDER BY createdAt DESC');
    res.json({ users });
  } catch (error) {
    if (String(error?.code) === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'USERNAME_EXISTS' });
      return;
    }
    console.error('Create user error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/state', authRequired, async (_req, res) => {
  try {
    const payload = await buildStateResponse();
    res.json(payload);
  } catch (error) {
    console.error('Failed to read state', error);
    res.status(500).json({ error: 'Failed to read state' });
  }
});

app.post('/api/state', authRequired, async (req, res) => {
  const { items = [], purchases = [], distributions = [], wasteRecords = [] } = req.body || {};
  try {
    await withTransaction(async (conn) => {
      await run(conn, 'DELETE FROM receipts');
      await run(conn, 'DELETE FROM purchases');
      await run(conn, 'DELETE FROM distributions');
      await run(conn, 'DELETE FROM waste_records');
      await run(conn, 'DELETE FROM items');

      for (const item of items) {
        await run(
          conn,
          `INSERT INTO items (
            id, code, name, category, department, unit, minStock, currentStock, location, supplier, catalogNo, lotNo, brand, storageLocation, status, expiryDate, openingDate, storageTemp, chemicalType, msdsUrl, wasteStatus, createdAt, createdBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            item.id,
            item.code,
            item.name,
            item.category || '',
            item.department || '',
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
            item.expiryDate || null,
            item.openingDate || null,
            item.storageTemp || '',
            item.chemicalType || '',
            item.msdsUrl || '',
            item.wasteStatus || '',
            item.createdAt || null,
            item.createdBy || ''
          ]
        );
      }

      for (const p of purchases) {
        await run(
          conn,
          `INSERT INTO purchases (
            id, requestNumber, itemId, itemCode, itemName, department, requestedQty, requestedBy, requestedAt, requestDate, status, approvedBy, approvedAt, approvedDate, approvalNote,
            orderedBy, orderedAt, supplierName, poNumber, orderedQty, receivedQtyTotal, receivedQty, receivedBy, receivedDate, lotNo, expiryDate, distributorCompany, notes, urgency, rejectionReason, rejectedBy, rejectedDate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            p.id,
            p.requestNumber || null,
            p.itemId,
            p.itemCode || '',
            p.itemName || '',
            p.department || '',
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
              conn,
              `INSERT INTO receipts (receiptId, purchaseId, receivedAt, receivedBy, receivedQty, lotNo, expiryDate, invoiceNo, attachmentUrl, attachmentName)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              , [
                r.receiptId,
                p.id,
                r.receivedAt || null,
                r.receivedBy || '',
                r.receivedQty ?? 0,
                r.lotNo || '',
                r.expiryDate || '',
                r.invoiceNo || '',
                r.attachmentUrl || '',
                r.attachmentName || ''
              ]
            );
          }
        }
      }

      for (const d of distributions) {
        await run(
          conn,
          `INSERT INTO distributions (
            id, itemId, itemCode, itemName, department, quantity, distributedBy, distributedDate, receivedBy, purpose, completedDate, completedBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            d.id,
            d.itemId,
            d.itemCode || '',
            d.itemName || '',
            d.department || '',
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

      for (const w of wasteRecords) {
        await run(
          conn,
          `INSERT INTO waste_records (
            id, itemId, itemCode, itemName, quantity, wasteType, reason, disposalMethod, disposedBy, disposedDate, certificationNo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            w.id,
            w.itemId,
            w.itemCode || '',
            w.itemName || '',
            w.quantity ?? 0,
            w.wasteType || '',
            w.reason || '',
            w.disposalMethod || '',
            w.disposedBy || '',
            w.disposedDate || null,
            w.certificationNo || ''
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

const startServer = async () => {
  try {
    await ensureUsersTable();
    await pool.query('SELECT 1');
    console.log(`Connected to MySQL: ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`);
  } catch (error) {
    console.error('Failed to connect to MySQL. Check server/.env and ensure the database + tables exist.', error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
};

startServer();
