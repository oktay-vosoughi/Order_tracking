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

const ROLES = {
  ADMIN: 'ADMIN',
  SATINAL: 'SATINAL',
  SATINAL_LOJISTIK: 'SATINAL_LOJISTIK',
  OBSERVER: 'OBSERVER'
};

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

const toMySQLDateTime = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoDateTime = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z)?$/i
    );
    if (isoDateTime) {
      return `${isoDateTime[1]} ${isoDateTime[2]}`;
    }

    const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) {
      return `${dateOnly[1]} 00:00:00`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds()
  )}`;
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

// Role-based middleware helpers
const requireRole = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user?.role)) {
    res.status(403).json({ error: 'FORBIDDEN' });
    return;
  }
  next();
};

// Capability checks (aligned with new SATINAL roles)
const canApprove = (req, res, next) =>
  requireRole([ROLES.ADMIN, ROLES.SATINAL_LOJISTIK])(req, res, next);
const canOrder = (req, res, next) => requireRole([ROLES.ADMIN, ROLES.SATINAL])(req, res, next);
const canDistribute = (req, res, next) =>
  requireRole([ROLES.ADMIN, ROLES.SATINAL_LOJISTIK])(req, res, next);
const canRequest = (req, res, next) =>
  requireRole([ROLES.ADMIN, ROLES.SATINAL_LOJISTIK])(req, res, next);

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
  // Note: items table no longer exists - using unified LOT system
  // Return empty items array for backward compatibility
  const [purchases, receipts, distributions, wasteRecords] = await Promise.all([
    all(pool, 'SELECT * FROM purchases ORDER BY requestedAt ASC'),
    all(pool, 'SELECT * FROM receipts ORDER BY receivedAt ASC'),
    all(pool, 'SELECT * FROM distributions ORDER BY distributedDate ASC'),
    all(pool, 'SELECT * FROM waste_records ORDER BY disposedDate ASC')
  ]);
  const items = []; // Legacy compatibility - use /api/unified-stock instead

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

app.patch('/api/users/:id', authRequired, adminRequired, async (req, res) => {
  const { username, role, password } = req.body || {};
  if (!username && !role && !password) {
    res.status(400).json({ error: 'INVALID_INPUT' });
    return;
  }

  const updates = [];
  const params = [];

  if (username) {
    updates.push('username = ?');
    params.push(String(username));
  }

  if (role) {
    const validRoles = [ROLES.ADMIN, ROLES.SATINAL, ROLES.SATINAL_LOJISTIK, ROLES.OBSERVER];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'INVALID_ROLE' });
      return;
    }
    updates.push('role = ?');
    params.push(String(role));
  }

  if (password) {
    if (String(password).length < 8) {
      res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Şifre en az 8 karakter olmalı' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    updates.push('passwordHash = ?');
    params.push(passwordHash);
  }

  params.push(req.params.id);

  try {
    await run(pool, `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const users = await all(pool, 'SELECT id, username, role, createdAt, createdBy FROM users ORDER BY createdAt DESC');
    res.json({ users });
  } catch (error) {
    if (String(error?.code) === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'USERNAME_EXISTS' });
      return;
    }
    console.error('Update user error', error);
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

app.post('/api/account/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Şifreler zorunludur' });
    return;
  }
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Yeni şifre en az 8 karakter olmalı' });
    return;
  }

  try {
    const rows = await all(pool, 'SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows?.[0];
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }

    const matches = await bcrypt.compare(String(currentPassword), String(user.passwordHash));
    if (!matches) {
      res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'Mevcut şifre hatalı' });
      return;
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await run(pool, 'UPDATE users SET passwordHash = ? WHERE id = ?', [newHash, user.id]);
    res.json({ status: 'PASSWORD_UPDATED' });
  } catch (error) {
    console.error('Change password error', error);
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
  const validRoles = [ROLES.ADMIN, ROLES.SATINAL, ROLES.SATINAL_LOJISTIK, ROLES.OBSERVER];
  if (!validRoles.includes(role)) {
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
      // Note: 'items' table no longer exists - using unified LOT system with item_definitions and lots tables
      // Legacy items insert is skipped - use /api/item-definitions and /api/lots endpoints instead
      // for (const item of items) { ... }

      for (const p of purchases) {
        await run(
          conn,
          `INSERT INTO purchases (
            id, requestNumber, itemId, itemCode, itemName, department, requestedQty, requestedBy, requestedAt, requestDate, status, approvedBy, approvedAt, approvedDate, approvalNote,
            orderedBy, orderedAt, supplierName, poNumber, orderedQty, receivedQtyTotal, notes, urgency, rejectionReason, rejectedBy, rejectedDate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          , [
            p.id,
            p.requestNumber || null,
            p.itemId,
            p.itemCode || '',
            p.itemName || '',
            p.department || '',
            p.requestedQty ?? 0,
            p.requestedBy || '',
            toMySQLDateTime(p.requestedAt) || null,
            toMySQLDateTime(p.requestDate) || null,
            p.status || '',
            p.approvedBy || '',
            toMySQLDateTime(p.approvedAt) || null,
            toMySQLDateTime(p.approvedDate) || null,
            p.approvalNote || '',
            p.orderedBy || '',
            toMySQLDateTime(p.orderedAt) || null,
            p.supplierName || '',
            p.poNumber || '',
            p.orderedQty ?? 0,
            p.receivedQtyTotal ?? 0,
            p.notes || '',
            p.urgency || '',
            p.rejectionReason || '',
            p.rejectedBy || '',
            toMySQLDateTime(p.rejectedDate) || null
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

// ============================================================
// LOT-BASED INVENTORY MANAGEMENT ENDPOINTS
// ============================================================

// Helper: Generate UUID
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- Item Definitions ---

// Get all item definitions with aggregated stock info
app.get('/api/item-definitions', authRequired, async (_req, res) => {
  try {
    const items = await all(pool, `
      SELECT 
        id.*, 
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
        COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      GROUP BY id.id
      ORDER BY id.name ASC
    `);
    res.json({ items });
  } catch (error) {
    console.error('Failed to get item definitions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get single item definition with its lots
app.get('/api/item-definitions/:id', authRequired, async (req, res) => {
  try {
    const items = await all(pool, 'SELECT * FROM item_definitions WHERE id = ?', [req.params.id]);
    if (!items.length) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const lots = await all(pool, `
      SELECT * FROM lots 
      WHERE itemId = ? 
      ORDER BY 
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        expiryDate ASC, 
        receivedDate ASC
    `, [req.params.id]);
    res.json({ item: items[0], lots });
  } catch (error) {
    console.error('Failed to get item definition', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Create item definition
app.post('/api/item-definitions', authRequired, async (req, res) => {
  const { code, name, category, department, unit, minStock, ideal_stock, max_stock, supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, msdsUrl, notes } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Code and name are required' });
  }

  try {
    const id = generateId();
    await run(pool, `
      INSERT INTO item_definitions (id, code, name, category, department, unit, minStock, ideal_stock, max_stock, supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, msdsUrl, notes, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, code, name, category || '', department || '', unit || '', minStock || 0, ideal_stock || null, max_stock || null, supplier || '', catalogNo || '', brand || '', storageLocation || '', storageTemp || '', chemicalType || '', msdsUrl || '', notes || '', req.user.username]);
    
    const items = await all(pool, 'SELECT * FROM item_definitions WHERE id = ?', [id]);
    res.json({ item: items[0] });
  } catch (error) {
    if (String(error?.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DUPLICATE_CODE', message: 'Item code already exists' });
    }
    console.error('Failed to create item definition', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Update item definition
app.put('/api/item-definitions/:id', authRequired, async (req, res) => {
  const { code, name, category, department, unit, minStock, ideal_stock, max_stock, supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, msdsUrl, notes, status } = req.body || {};
  
  try {
    await run(pool, `
      UPDATE item_definitions SET 
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        department = COALESCE(?, department),
        unit = COALESCE(?, unit),
        minStock = COALESCE(?, minStock),
        ideal_stock = COALESCE(?, ideal_stock),
        max_stock = COALESCE(?, max_stock),
        supplier = COALESCE(?, supplier),
        catalogNo = COALESCE(?, catalogNo),
        brand = COALESCE(?, brand),
        storageLocation = COALESCE(?, storageLocation),
        storageTemp = COALESCE(?, storageTemp),
        chemicalType = COALESCE(?, chemicalType),
        msdsUrl = COALESCE(?, msdsUrl),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updatedBy = ?
      WHERE id = ?
    `, [code, name, category, department, unit, minStock, ideal_stock, max_stock, supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, msdsUrl, notes, status, req.user.username, req.params.id]);
    
    const items = await all(pool, 'SELECT * FROM item_definitions WHERE id = ?', [req.params.id]);
    res.json({ item: items[0] });
  } catch (error) {
    console.error('Failed to update item definition', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Delete item definition (hard delete with cascading lot removal)
app.delete('/api/item-definitions/:id', authRequired, adminRequired, async (req, res) => {
  try {
    await withTransaction(async (conn) => {
      await run(conn, 'DELETE FROM lots WHERE itemId = ?', [req.params.id]);
      await run(conn, 'DELETE FROM item_definitions WHERE id = ?', [req.params.id]);
    });
    res.json({ status: 'deleted' });
  } catch (error) {
    console.error('Failed to delete item definition', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// --- Lots ---

// Get all lots (with item info)
app.get('/api/lots', authRequired, async (req, res) => {
  try {
    const { itemId, status, expiringSoon } = req.query;
    let sql = `
      SELECT l.*, id.name AS itemName, id.code AS itemCode, id.unit AS itemUnit
      FROM lots l
      JOIN item_definitions id ON l.itemId = id.id
      WHERE 1=1
    `;
    const params = [];
    
    if (itemId) {
      sql += ' AND l.itemId = ?';
      params.push(itemId);
    }
    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }
    if (expiringSoon === 'true') {
      sql += ' AND l.expiryDate IS NOT NULL AND l.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND l.expiryDate >= CURDATE()';
    }
    
    sql += ' ORDER BY l.expiryDate ASC, l.receivedDate ASC';
    
    const lots = await all(pool, sql, params);
    res.json({ lots });
  } catch (error) {
    console.error('Failed to get lots', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Create lot (receive stock)
app.post('/api/lots', authRequired, async (req, res) => {
  const { itemId, lotNumber, manufacturer, catalogNo, expiryDate, receivedDate, initialQuantity, department, location, storageLocation, invoiceNo, attachmentUrl, attachmentName, notes } = req.body || {};
  
  if (!itemId || !lotNumber || !initialQuantity || initialQuantity <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Item ID, lot number, and quantity are required' });
  }

  try {
    // Check if item exists
    const items = await all(pool, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
    if (!items.length) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
    }

    const id = generateId();
    await run(pool, `
      INSERT INTO lots (id, itemId, lotNumber, manufacturer, catalogNo, expiryDate, receivedDate, initialQuantity, currentQuantity, department, location, storageLocation, invoiceNo, attachmentUrl, attachmentName, notes, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, itemId, lotNumber, manufacturer || '', catalogNo || '', expiryDate || null, receivedDate || new Date().toISOString().split('T')[0], initialQuantity, initialQuantity, department || '', location || '', storageLocation || '', invoiceNo || '', attachmentUrl || '', attachmentName || '', notes || '', req.user.username]);
    
    const lots = await all(pool, 'SELECT * FROM lots WHERE id = ?', [id]);
    res.json({ lot: lots[0] });
  } catch (error) {
    if (String(error?.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DUPLICATE_LOT', message: 'This lot number already exists for this item' });
    }
    console.error('Failed to create lot', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Update lot
app.put('/api/lots/:id', authRequired, async (req, res) => {
  const { lotNumber, manufacturer, catalogNo, expiryDate, department, location, storageLocation, invoiceNo, attachmentUrl, attachmentName, notes, status } = req.body || {};
  
  try {
    await run(pool, `
      UPDATE lots SET 
        lotNumber = COALESCE(?, lotNumber),
        manufacturer = COALESCE(?, manufacturer),
        catalogNo = COALESCE(?, catalogNo),
        expiryDate = COALESCE(?, expiryDate),
        department = COALESCE(?, department),
        location = COALESCE(?, location),
        storageLocation = COALESCE(?, storageLocation),
        invoiceNo = COALESCE(?, invoiceNo),
        attachmentUrl = COALESCE(?, attachmentUrl),
        attachmentName = COALESCE(?, attachmentName),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updatedBy = ?
      WHERE id = ?
    `, [lotNumber, manufacturer, catalogNo, expiryDate, department, location, storageLocation, invoiceNo, attachmentUrl, attachmentName, notes, status, req.user.username, req.params.id]);
    
    const lots = await all(pool, 'SELECT * FROM lots WHERE id = ?', [req.params.id]);
    res.json({ lot: lots[0] });
  } catch (error) {
    console.error('Failed to update lot', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// --- Consumption (Usage) with FEFO Logic ---

// Consume from item (FEFO auto-selection or manual lot selection)
app.post('/api/consume', authRequired, async (req, res) => {
  const { itemId, lotId, quantity, department, purpose, notes, receivedBy } = req.body || {};
  
  if (!itemId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Item ID and quantity are required' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      const usageRecords = [];
      let remainingQty = quantity;

      if (lotId) {
        // Manual lot selection
        const lots = await all(conn, 'SELECT * FROM lots WHERE id = ? AND itemId = ? FOR UPDATE', [lotId, itemId]);
        if (!lots.length) {
          throw { status: 404, error: 'LOT_NOT_FOUND' };
        }
        const lot = lots[0];
        if (lot.currentQuantity < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_STOCK', message: `LOT ${lot.lotNumber} has only ${lot.currentQuantity} available` };
        }

        // Deduct from selected lot
        await run(conn, 'UPDATE lots SET currentQuantity = currentQuantity - ?, status = CASE WHEN currentQuantity - ? <= 0 THEN "DEPLETED" ELSE status END, updatedBy = ? WHERE id = ?', [quantity, quantity, req.user.username, lotId]);
        
        const usageId = generateId();
        await run(conn, `
          INSERT INTO usage_records (id, lotId, itemId, quantityUsed, usedBy, receivedBy, department, purpose, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [usageId, lotId, itemId, quantity, req.user.username, receivedBy || '', department || '', purpose || '', notes || '']);
        
        usageRecords.push({ usageId, lotId, lotNumber: lot.lotNumber, quantityUsed: quantity });
      } else {
        // FEFO auto-selection
        const availableLots = await all(conn, `
          SELECT * FROM lots 
          WHERE itemId = ? AND status = 'ACTIVE' AND currentQuantity > 0 
          ORDER BY 
            CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END,
            expiryDate ASC, 
            receivedDate ASC
          FOR UPDATE
        `, [itemId]);

        if (!availableLots.length) {
          throw { status: 400, error: 'NO_STOCK_AVAILABLE' };
        }

        const totalAvailable = availableLots.reduce((sum, l) => sum + l.currentQuantity, 0);
        if (totalAvailable < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_TOTAL_STOCK', message: `Total available: ${totalAvailable}, requested: ${quantity}` };
        }

        // Consume from lots in FEFO order
        for (const lot of availableLots) {
          if (remainingQty <= 0) break;

          const deductQty = Math.min(lot.currentQuantity, remainingQty);
          const newQty = lot.currentQuantity - deductQty;
          const newStatus = newQty <= 0 ? 'DEPLETED' : lot.status;

          await run(conn, 'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?', [newQty, newStatus, req.user.username, lot.id]);
          
          const usageId = generateId();
          await run(conn, `
            INSERT INTO usage_records (id, lotId, itemId, quantityUsed, usedBy, receivedBy, department, purpose, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [usageId, lot.id, itemId, deductQty, req.user.username, receivedBy || '', department || '', purpose || '', notes || '']);
          
          usageRecords.push({ usageId, lotId: lot.id, lotNumber: lot.lotNumber, quantityUsed: deductQty });
          remainingQty -= deductQty;
        }
      }

      return { usageRecords, totalConsumed: quantity };
    });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, message: error.message });
    }
    console.error('Failed to consume', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get usage records
app.get('/api/usage-records', authRequired, async (req, res) => {
  try {
    const { itemId, lotId, startDate, endDate } = req.query;
    let sql = `
      SELECT ur.*, l.lotNumber, id.name AS itemName, id.code AS itemCode, id.unit AS itemUnit
      FROM usage_records ur
      JOIN lots l ON ur.lotId = l.id
      JOIN item_definitions id ON ur.itemId = id.id
      WHERE 1=1
    `;
    const params = [];
    
    if (itemId) {
      sql += ' AND ur.itemId = ?';
      params.push(itemId);
    }
    if (lotId) {
      sql += ' AND ur.lotId = ?';
      params.push(lotId);
    }
    if (startDate) {
      sql += ' AND ur.usedAt >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND ur.usedAt <= ?';
      params.push(endDate);
    }
    
    sql += ' ORDER BY ur.usedAt DESC';
    
    const records = await all(pool, sql, params);
    res.json({ records });
  } catch (error) {
    console.error('Failed to get usage records', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// --- Lot Adjustments (for corrections, waste, etc.) ---

app.post('/api/lot-adjustments', authRequired, async (req, res) => {
  const { lotId, adjustmentType, quantityChange, reason, notes } = req.body || {};
  
  if (!lotId || !adjustmentType || quantityChange === undefined) {
    return res.status(400).json({ error: 'INVALID_INPUT' });
  }

  try {
    await withTransaction(async (conn) => {
      const lots = await all(conn, 'SELECT * FROM lots WHERE id = ? FOR UPDATE', [lotId]);
      if (!lots.length) {
        throw { status: 404, error: 'LOT_NOT_FOUND' };
      }

      const newQty = lots[0].currentQuantity + quantityChange;
      if (newQty < 0) {
        throw { status: 400, error: 'NEGATIVE_QUANTITY', message: 'Adjustment would result in negative quantity' };
      }

      const newStatus = newQty <= 0 ? 'DEPLETED' : (lots[0].status === 'DEPLETED' ? 'ACTIVE' : lots[0].status);
      await run(conn, 'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?', [newQty, newStatus, req.user.username, lotId]);
      
      const id = generateId();
      await run(conn, `
        INSERT INTO lot_adjustments (id, lotId, adjustmentType, quantityChange, reason, adjustedBy, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, lotId, adjustmentType, quantityChange, reason || '', req.user.username, notes || '']);
    });

    const lots = await all(pool, 'SELECT * FROM lots WHERE id = ?', [lotId]);
    res.json({ lot: lots[0] });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, message: error.message });
    }
    console.error('Failed to adjust lot', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// --- Reports ---

// Stock summary report
app.get('/api/reports/stock-summary', authRequired, async (_req, res) => {
  try {
    const summary = await all(pool, `
      SELECT 
        id.id,
        id.code,
        id.name,
        id.category,
        id.department,
        id.unit,
        id.minStock,
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
        COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount,
        MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) AS nearestExpiry
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      GROUP BY id.id
      ORDER BY id.name ASC
    `);
    res.json({ summary });
  } catch (error) {
    console.error('Failed to get stock summary', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Expiry report
app.get('/api/reports/expiry', authRequired, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const lots = await all(pool, `
      SELECT l.*, id.name AS itemName, id.code AS itemCode, id.unit AS itemUnit
      FROM lots l
      JOIN item_definitions id ON l.itemId = id.id
      WHERE l.status = 'ACTIVE' 
        AND l.currentQuantity > 0 
        AND l.expiryDate IS NOT NULL 
        AND l.expiryDate <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY l.expiryDate ASC
    `, [parseInt(days)]);
    res.json({ lots });
  } catch (error) {
    console.error('Failed to get expiry report', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Low stock report
app.get('/api/reports/low-stock', authRequired, async (_req, res) => {
  try {
    const items = await all(pool, `
      SELECT 
        id.*,
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS totalStock
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      GROUP BY id.id, id.minStock
      HAVING totalStock < id.minStock
      ORDER BY (totalStock / NULLIF(id.minStock, 0)) ASC
    `);
    res.json({ items });
  } catch (error) {
    console.error('Failed to get low stock report', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Department stock report
app.get('/api/reports/department-stock', authRequired, async (_req, res) => {
  try {
    const report = await all(pool, `
      SELECT 
        COALESCE(l.department, 'Belirtilmemiş') AS department,
        COUNT(DISTINCT l.itemId) AS uniqueItems,
        COUNT(DISTINCT l.id) AS totalLots,
        SUM(l.currentQuantity) AS totalQuantity
      FROM lots l
      WHERE l.status = 'ACTIVE' AND l.currentQuantity > 0
      GROUP BY l.department
      ORDER BY totalQuantity DESC
    `);
    res.json({ report });
  } catch (error) {
    console.error('Failed to get department stock report', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// UNIFIED STOCK VIEW - Aggregated from LOTs
// ============================================================

// Get unified stock view (items with aggregated lot data)
app.get('/api/unified-stock', authRequired, async (_req, res) => {
  try {
    const items = await all(pool, `
      SELECT 
        id.id,
        id.code,
        id.name,
        id.category,
        id.department,
        id.unit,
        id.minStock,
        id.supplier,
        id.catalogNo,
        id.brand,
        id.storageLocation,
        id.storageTemp,
        id.chemicalType,
        id.msdsUrl,
        id.notes,
        id.status AS itemStatus,
        id.createdAt,
        id.createdBy,
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS availableStock,
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) AS expiredStock,
        COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount,
        MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate >= CURDATE() THEN l.expiryDate END) AS nearestExpiry,
        COALESCE(
          (SELECT SUM(p.orderedQty - COALESCE(p.receivedQtyTotal, 0))
           FROM purchases p
           WHERE p.itemId = id.id AND p.status IN ('ONAYLANDI', 'SIPARIS_VERILDI', 'KISMI_TESLIM')
             AND p.orderedQty > COALESCE(p.receivedQtyTotal, 0)
          ), 0
        ) AS pendingOrderQty,
        CASE 
          WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) = 0 THEN 'STOK_YOK'
          WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) < id.minStock THEN 'SATIN_AL'
          WHEN MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'SKT_YAKIN'
          WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) > 0 THEN 'SKT_GECMIS'
          ELSE 'STOKTA'
        END AS stockStatus
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      WHERE id.status = 'ACTIVE'
      GROUP BY id.id
      ORDER BY id.name ASC
    `);
    res.json({ items });
  } catch (error) {
    console.error('Failed to get unified stock', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get item lots (for drill-down)
app.get('/api/unified-stock/:itemId/lots', authRequired, async (req, res) => {
  try {
    const lots = await all(pool, `
      SELECT l.*, 
        CASE 
          WHEN l.expiryDate < CURDATE() THEN 'EXPIRED'
          WHEN l.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
          ELSE 'OK'
        END AS expiryStatus
      FROM lots l
      WHERE l.itemId = ?
      ORDER BY 
        CASE WHEN l.status = 'ACTIVE' THEN 0 ELSE 1 END,
        CASE WHEN l.expiryDate IS NULL THEN 1 ELSE 0 END,
        l.expiryDate ASC,
        l.receivedDate ASC
    `, [req.params.itemId]);
    res.json({ lots });
  } catch (error) {
    console.error('Failed to get item lots', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// TESLIM AL - Receive goods and create LOT
// ============================================================

// Receive goods (PROCUREMENT + ADMIN)
app.post('/api/receive-goods', authRequired, canOrder, async (req, res) => {
  const {
    purchaseId,
    receiptId,
    itemId,
    lotNumber,
    quantity,
    expiryDate,
    invoiceNo,
    attachmentUrl,
    attachmentName,
    notes,
    receivedBy,
    receivedAt
  } = req.body || {};
  
  if (!purchaseId || !itemId || !lotNumber || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Purchase ID, item ID, lot number, and quantity are required' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      // Verify item exists in item_definitions
      const items = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
      if (!items.length) {
        throw { status: 404, error: 'ITEM_NOT_FOUND' };
      }
      const item = items[0];

      // Verify purchase exists
      const purchases = await all(conn, 'SELECT * FROM purchases WHERE id = ?', [purchaseId]);
      if (!purchases.length) {
        throw { status: 404, error: 'PURCHASE_NOT_FOUND' };
      }
      const purchase = purchases[0];

      const normalizedReceiptId = receiptId || generateId();
      const receiptTimestamp = toMySQLDateTime(receivedAt) || toMySQLDateTime(new Date());

      // Check if lot already exists for this item
      const existingLots = await all(conn, 'SELECT * FROM lots WHERE itemId = ? AND lotNumber = ?', [item.id, lotNumber]);
      
      let lotId;
      if (existingLots.length) {
        // Add to existing lot
        lotId = existingLots[0].id;
        await run(conn, `
          UPDATE lots SET 
            currentQuantity = currentQuantity + ?,
            initialQuantity = initialQuantity + ?,
            status = 'ACTIVE',
            updatedBy = ?
          WHERE id = ?
        `, [quantity, quantity, req.user.username, lotId]);
      } else {
        // Create new lot
        lotId = generateId();
        await run(conn, `
          INSERT INTO lots (id, itemId, purchaseId, receiptId, lotNumber, expiryDate, receivedDate, initialQuantity, currentQuantity, invoiceNo, attachmentUrl, attachmentName, notes, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)
        `, [lotId, item.id, purchaseId, normalizedReceiptId, lotNumber, expiryDate || null, quantity, quantity, invoiceNo || '', attachmentUrl || '', attachmentName || '', notes || '', req.user.username]);
      }

      // Insert or update receipt record
      await run(conn, `
        INSERT INTO receipts (receiptId, purchaseId, receivedAt, receivedBy, receivedQty, lotNo, expiryDate, invoiceNo, attachmentUrl, attachmentName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          receivedAt = VALUES(receivedAt),
          receivedBy = VALUES(receivedBy),
          receivedQty = VALUES(receivedQty),
          lotNo = VALUES(lotNo),
          expiryDate = VALUES(expiryDate),
          invoiceNo = VALUES(invoiceNo),
          attachmentUrl = VALUES(attachmentUrl),
          attachmentName = VALUES(attachmentName)
      `, [
        normalizedReceiptId,
        purchaseId,
        receiptTimestamp,
        receivedBy || req.user.username,
        quantity,
        lotNumber,
        expiryDate || null,
        invoiceNo || '',
        attachmentUrl || '',
        attachmentName || ''
      ]);

      await run(conn, 'UPDATE receipts SET lotId = ? WHERE receiptId = ?', [lotId, normalizedReceiptId]);

      const newReceivedTotal = (purchase.receivedQtyTotal || 0) + quantity;
      const orderedQty = purchase.orderedQty || purchase.requestedQty || 0;
      const newStatus = newReceivedTotal >= orderedQty ? 'TESLIM_ALINDI' : 'KISMI_TESLIM';

      await run(conn, `
        UPDATE purchases
        SET receivedQtyTotal = ?, status = ?, receivedBy = ?, receivedDate = ?, lotNo = ?, expiryDate = ?
        WHERE id = ?
      `, [
        newReceivedTotal,
        newStatus,
        receivedBy || req.user.username,
        receiptTimestamp,
        lotNumber,
        expiryDate || null,
        purchaseId
      ]);

      const lotRecord = (await all(conn, 'SELECT * FROM lots WHERE id = ?', [lotId]))[0];
      const receiptRecord = (await all(conn, 'SELECT * FROM receipts WHERE receiptId = ?', [normalizedReceiptId]))[0];
      const updatedPurchase = (await all(conn, 'SELECT * FROM purchases WHERE id = ?', [purchaseId]))[0];

      return { lot: lotRecord, receipt: receiptRecord, purchase: updatedPurchase };
    });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, message: error.message });
    }
    console.error('Failed to receive goods', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// DISTRIBUTION - Lot-traceable with FEFO
// ============================================================

// Distribute (LAB_MANAGER + PROCUREMENT + ADMIN)
app.post('/api/distribute', authRequired, canDistribute, async (req, res) => {
  const { itemId, quantity, receivedBy, department, purpose, useFefo = true, lotId } = req.body || {};
  
  if (!itemId || !quantity || quantity <= 0 || !receivedBy) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Item ID, quantity, and receiver are required' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      const distributionId = generateId();
      const distributionLots = [];
      let remainingQty = quantity;

      // Get item info
      const items = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
      if (!items.length) {
        throw { status: 404, error: 'ITEM_NOT_FOUND' };
      }
      const item = items[0];

      if (lotId && !useFefo) {
        // Manual lot selection
        const lots = await all(conn, 'SELECT * FROM lots WHERE id = ? AND itemId = ? FOR UPDATE', [lotId, itemId]);
        if (!lots.length) {
          throw { status: 404, error: 'LOT_NOT_FOUND' };
        }
        const lot = lots[0];
        if (lot.currentQuantity < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_STOCK', message: `LOT ${lot.lotNumber} has only ${lot.currentQuantity} available` };
        }

        await run(conn, 'UPDATE lots SET currentQuantity = currentQuantity - ?, status = CASE WHEN currentQuantity - ? <= 0 THEN "DEPLETED" ELSE status END, updatedBy = ? WHERE id = ?', [quantity, quantity, req.user.username, lotId]);
        distributionLots.push({ lotId, lotNumber: lot.lotNumber, quantityUsed: quantity });
      } else {
        // FEFO auto-selection
        const availableLots = await all(conn, `
          SELECT * FROM lots 
          WHERE itemId = ? AND status = 'ACTIVE' AND currentQuantity > 0 AND (expiryDate IS NULL OR expiryDate >= CURDATE())
          ORDER BY 
            CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END,
            expiryDate ASC, 
            receivedDate ASC
          FOR UPDATE
        `, [itemId]);

        if (!availableLots.length) {
          throw { status: 400, error: 'NO_STOCK_AVAILABLE' };
        }

        const totalAvailable = availableLots.reduce((sum, l) => sum + l.currentQuantity, 0);
        if (totalAvailable < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_TOTAL_STOCK', message: `Total available: ${totalAvailable}, requested: ${quantity}` };
        }

        for (const lot of availableLots) {
          if (remainingQty <= 0) break;

          const deductQty = Math.min(lot.currentQuantity, remainingQty);
          const newQty = lot.currentQuantity - deductQty;
          const newStatus = newQty <= 0 ? 'DEPLETED' : lot.status;

          await run(conn, 'UPDATE lots SET currentQuantity = ?, status = ?, updatedBy = ? WHERE id = ?', [newQty, newStatus, req.user.username, lot.id]);
          distributionLots.push({ lotId: lot.id, lotNumber: lot.lotNumber, quantityUsed: deductQty });
          remainingQty -= deductQty;
        }
      }

      // Create distribution record
      await run(conn, `
        INSERT INTO distributions (id, itemId, itemCode, itemName, department, quantity, useFefo, status, distributedBy, distributedDate, receivedBy, purpose)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), ?, ?)
      `, [distributionId, itemId, item.code, item.name, department || '', quantity, useFefo ? 1 : 0, req.user.username, receivedBy, purpose || '']);

      // Create distribution_lots records
      for (const dl of distributionLots) {
        const dlId = generateId();
        await run(conn, `
          INSERT INTO distribution_lots (id, distributionId, lotId, lotNumber, quantityUsed)
          VALUES (?, ?, ?, ?, ?)
        `, [dlId, distributionId, dl.lotId, dl.lotNumber, dl.quantityUsed]);
      }

      return { distributionId, distributionLots, totalDistributed: quantity };
    });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, message: error.message });
    }
    console.error('Failed to distribute', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Confirm distribution (LAB_MANAGER + PROCUREMENT + ADMIN)
app.post('/api/distribute/:id/confirm', authRequired, canDistribute, async (req, res) => {
  try {
    await run(pool, `
      UPDATE distributions SET status = 'COMPLETED', completedDate = NOW(), completedBy = ?
      WHERE id = ?
    `, [req.user.username, req.params.id]);
    
    const distributions = await all(pool, 'SELECT * FROM distributions WHERE id = ?', [req.params.id]);
    res.json({ distribution: distributions[0] });
  } catch (error) {
    console.error('Failed to confirm distribution', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Create purchase request (LAB_MANAGER only)
app.post('/api/purchases', authRequired, canRequest, async (req, res) => {
  const { itemId, itemCode, itemName, department, requestedQty, notes, urgency, supplierName } = req.body || {};
  
  if (!itemId || !requestedQty || requestedQty <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Item ID and quantity are required' });
  }

  try {
    const purchaseId = generateId();
    const requestNumber = 'REQ-' + Date.now().toString().slice(-6);
    
    await run(pool, `
      INSERT INTO purchases (
        id, requestNumber, itemId, itemCode, itemName, department,
        requestedQty, requestedBy, requestedAt, requestDate,
        status, supplierName, orderedQty, notes, urgency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), CURDATE(), 'TALEP_EDILDI', ?, ?, ?, ?)
    `, [
      purchaseId, requestNumber, itemId, itemCode || '', itemName || '', department || '',
      requestedQty, req.user.username, supplierName || '', requestedQty, notes || '', urgency || 'normal'
    ]);
    
    const purchases = await all(pool, 'SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    res.json({ purchase: purchases[0] });
  } catch (error) {
    console.error('Failed to create purchase request', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get all purchases
app.get('/api/purchases', authRequired, async (_req, res) => {
  try {
    const [purchases, receipts] = await Promise.all([
      all(pool, 'SELECT * FROM purchases ORDER BY requestedAt DESC'),
      all(pool, 'SELECT * FROM receipts ORDER BY receivedAt DESC')
    ]);

    const receiptsByPurchase = receipts.reduce((acc, receipt) => {
      if (!acc[receipt.purchaseId]) acc[receipt.purchaseId] = [];
      acc[receipt.purchaseId].push(receipt);
      return acc;
    }, {});

    const purchasesWithReceipts = purchases.map((purchase) => ({
      ...purchase,
      receipts: receiptsByPurchase[purchase.id] || []
    }));

    res.json({ purchases: purchasesWithReceipts });
  } catch (error) {
    console.error('Failed to get purchases', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Approve purchase request (LAB_MANAGER + ADMIN)
app.post('/api/purchases/:id/approve', authRequired, canApprove, async (req, res) => {
  const { approvalNote } = req.body || {};
  
  try {
    await run(pool, `
      UPDATE purchases SET 
        status = 'ONAYLANDI',
        approvedBy = ?,
        approvedAt = NOW(),
        approvedDate = CURDATE(),
        approvalNote = ?
      WHERE id = ?
    `, [req.user.username, approvalNote || '', req.params.id]);
    
    const purchases = await all(pool, 'SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    res.json({ purchase: purchases[0] });
  } catch (error) {
    console.error('Failed to approve purchase', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Reject purchase request (LAB_MANAGER + ADMIN)
app.post('/api/purchases/:id/reject', authRequired, canApprove, async (req, res) => {
  const { rejectionReason } = req.body || {};
  
  if (!rejectionReason) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Rejection reason is required' });
  }
  
  try {
    await run(pool, `
      UPDATE purchases SET 
        status = 'REDDEDILDI',
        rejectedBy = ?,
        rejectedDate = NOW(),
        rejectionReason = ?
      WHERE id = ?
    `, [req.user.username, rejectionReason, req.params.id]);
    
    const purchases = await all(pool, 'SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    res.json({ purchase: purchases[0] });
  } catch (error) {
    console.error('Failed to reject purchase', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Mark purchase as ordered (PROCUREMENT + ADMIN)
app.post('/api/purchases/:id/order', authRequired, canOrder, async (req, res) => {
  const { supplierName, poNumber, orderedQty } = req.body || {};
  
  if (!supplierName || !orderedQty || orderedQty <= 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Supplier name and ordered quantity are required' });
  }
  
  try {
    await run(pool, `
      UPDATE purchases SET 
        status = 'SIPARIS_VERILDI',
        orderedBy = ?,
        orderedAt = NOW(),
        supplierName = ?,
        poNumber = ?,
        orderedQty = ?
      WHERE id = ?
    `, [req.user.username, supplierName, poNumber || '', orderedQty, req.params.id]);
    
    const purchases = await all(pool, 'SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    res.json({ purchase: purchases[0] });
  } catch (error) {
    console.error('Failed to mark as ordered', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get all distributions
app.get('/api/distributions', authRequired, async (_req, res) => {
  try {
    const distributions = await all(pool, 'SELECT * FROM distributions ORDER BY distributedDate DESC');
    res.json({ distributions });
  } catch (error) {
    console.error('Failed to get distributions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get all waste records
app.get('/api/waste-records', authRequired, async (_req, res) => {
  try {
    const wasteRecords = await all(pool, 'SELECT * FROM waste_records ORDER BY disposedDate DESC');
    res.json({ wasteRecords });
  } catch (error) {
    console.error('Failed to get waste records', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Get distributions with lot details
app.get('/api/distributions-detailed', authRequired, async (_req, res) => {
  try {
    const distributions = await all(pool, `
      SELECT d.*, 
        GROUP_CONCAT(CONCAT(dl.lotNumber, ':', dl.quantityUsed) SEPARATOR ', ') AS lotDetails
      FROM distributions d
      LEFT JOIN distribution_lots dl ON d.id = dl.distributionId
      GROUP BY d.id
      ORDER BY d.distributedDate DESC
    `);
    res.json({ distributions });
  } catch (error) {
    console.error('Failed to get distributions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// WASTE - Lot-traceable
// ============================================================

// Record waste (LAB_MANAGER + PROCUREMENT + ADMIN)
app.post('/api/waste-with-lot', authRequired, canDistribute, async (req, res) => {
  const { itemId, lotId, quantity, wasteType, reason, disposalMethod, notes } = req.body || {};
  
  if (!itemId || !quantity || quantity <= 0 || !wasteType) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Item ID, quantity, and waste type are required' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      // Get item info
      const items = await all(conn, 'SELECT * FROM item_definitions WHERE id = ?', [itemId]);
      if (!items.length) {
        throw { status: 404, error: 'ITEM_NOT_FOUND' };
      }
      const item = items[0];

      let lotNumber = null;
      let actualLotId = lotId;

      if (lotId) {
        // Specific lot waste
        const lots = await all(conn, 'SELECT * FROM lots WHERE id = ? FOR UPDATE', [lotId]);
        if (!lots.length) {
          throw { status: 404, error: 'LOT_NOT_FOUND' };
        }
        const lot = lots[0];
        if (lot.currentQuantity < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_STOCK', message: `LOT ${lot.lotNumber} has only ${lot.currentQuantity}` };
        }
        
        lotNumber = lot.lotNumber;
        await run(conn, 'UPDATE lots SET currentQuantity = currentQuantity - ?, status = CASE WHEN currentQuantity - ? <= 0 THEN "DEPLETED" ELSE status END, updatedBy = ? WHERE id = ?', [quantity, quantity, req.user.username, lotId]);
      } else {
        // Use FEFO to select lots for waste (e.g., expired items first)
        const expiredLots = await all(conn, `
          SELECT * FROM lots 
          WHERE itemId = ? AND status = 'ACTIVE' AND currentQuantity > 0
          ORDER BY 
            CASE WHEN expiryDate IS NOT NULL AND expiryDate < CURDATE() THEN 0 ELSE 1 END,
            expiryDate ASC
          FOR UPDATE
        `, [itemId]);

        if (!expiredLots.length) {
          throw { status: 400, error: 'NO_STOCK_AVAILABLE' };
        }

        let remainingQty = quantity;
        const totalAvailable = expiredLots.reduce((sum, l) => sum + l.currentQuantity, 0);
        if (totalAvailable < quantity) {
          throw { status: 400, error: 'INSUFFICIENT_STOCK' };
        }

        for (const lot of expiredLots) {
          if (remainingQty <= 0) break;
          const deductQty = Math.min(lot.currentQuantity, remainingQty);
          await run(conn, 'UPDATE lots SET currentQuantity = currentQuantity - ?, status = CASE WHEN currentQuantity - ? <= 0 THEN "DEPLETED" ELSE status END, updatedBy = ? WHERE id = ?', [deductQty, deductQty, req.user.username, lot.id]);
          remainingQty -= deductQty;
          if (!actualLotId) actualLotId = lot.id;
          if (!lotNumber) lotNumber = lot.lotNumber;
        }
      }

      // Create waste record
      const wasteId = generateId();
      await run(conn, `
        INSERT INTO waste_records (id, itemId, lotId, lotNumber, itemCode, itemName, quantity, wasteType, reason, disposalMethod, disposedBy, disposedDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [wasteId, itemId, actualLotId, lotNumber, item.code, item.name, quantity, wasteType, reason || '', disposalMethod || '', req.user.username]);

      return { wasteId, lotNumber, quantity };
    });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, message: error.message });
    }
    console.error('Failed to record waste', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// ATTACHMENTS
// ============================================================

app.get('/api/attachments/:entityType/:entityId', authRequired, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    
    // For lots, get from lots table directly
    if (entityType === 'lot') {
      const lots = await all(pool, 'SELECT attachmentUrl, attachmentName FROM lots WHERE id = ?', [entityId]);
      if (lots.length && lots[0].attachmentUrl) {
        return res.json({ attachments: [{ fileName: lots[0].attachmentName, fileData: lots[0].attachmentUrl }] });
      }
    }
    
    // For receipts
    if (entityType === 'receipt') {
      const receipts = await all(pool, 'SELECT attachmentUrl, attachmentName FROM receipts WHERE receiptId = ?', [entityId]);
      if (receipts.length && receipts[0].attachmentUrl) {
        return res.json({ attachments: [{ fileName: receipts[0].attachmentName, fileData: receipts[0].attachmentUrl }] });
      }
    }
    
    // General attachments table
    const attachments = await all(pool, 'SELECT * FROM attachments WHERE entityType = ? AND entityId = ?', [entityType, entityId]);
    res.json({ attachments });
  } catch (error) {
    console.error('Failed to get attachments', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// EXCEL IMPORT - Items with optional initial stock
// ============================================================

app.post('/api/import-items', authRequired, async (req, res) => {
  const { items } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Items array is required' });
  }

  const normalizeString = (value) => (value === undefined || value === null ? '' : String(value).trim());
  const parseDecimal = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const normalized = String(value).trim().replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };
  const parseInteger = (value) => {
    const decimal = parseDecimal(value);
    return decimal === null ? null : Math.round(decimal);
  };
  const parseDate = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 10);
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    return null;
  };

  try {
    const result = await withTransaction(async (conn) => {
      let created = 0;
      let updated = 0;
      let lotsCreated = 0;
      let lotsUpdated = 0;
      const errors = [];

      // Normalize rows and group by code
      const itemsByCode = {};
      items.forEach((raw, idx) => {
        const code = normalizeString(raw.code);
        const name = normalizeString(raw.name);
        const lotNumber = normalizeString(raw.lotNumber || raw.lotNo);

        if (!code || !name) {
          errors.push(`Row ${idx + 1}: missing code or name`);
          return;
        }
        if (!lotNumber) {
          errors.push(`Row ${idx + 1}: missing lot number for item ${code}`);
          return;
        }

        const normalizedRow = {
          code,
          name,
          category: normalizeString(raw.category),
          department: normalizeString(raw.department),
          unit: normalizeString(raw.unit) || 'adet',
          minStock: parseInteger(raw.minStock) ?? 0,
          ideal_stock: parseDecimal(raw.ideal_stock),
          max_stock: parseDecimal(raw.max_stock),
          supplier: normalizeString(raw.supplier),
          catalogNo: normalizeString(raw.catalogNo),
          brand: normalizeString(raw.brand),
          storageLocation: normalizeString(raw.storageLocation),
          storageTemp: normalizeString(raw.storageTemp),
          chemicalType: normalizeString(raw.chemicalType),
          notes: normalizeString(raw.notes),
          lotNumber,
          initialStock: parseInteger(raw.initialStock) ?? 0,
          expiryDate: parseDate(raw.expiryDate),
          receivedDate: parseDate(raw.receivedDate) || new Date().toISOString().slice(0, 10)
        };

        if (!itemsByCode[code]) {
          itemsByCode[code] = [];
        }
        itemsByCode[code].push(normalizedRow);
      });

      for (const [code, itemRows] of Object.entries(itemsByCode)) {
        const masterItem = itemRows[0];

        const existing = await all(conn, 'SELECT * FROM item_definitions WHERE code = ?', [code]);

        let itemId;
        if (existing.length) {
          itemId = existing[0].id;
          await run(conn, `
            UPDATE item_definitions SET 
              name = ?, category = ?, department = ?, unit = ?, minStock = ?, 
              ideal_stock = ?, max_stock = ?, supplier = ?, catalogNo = ?, brand = ?, storageLocation = ?, 
              storageTemp = ?, chemicalType = ?, status = 'ACTIVE', notes = ?, updatedBy = ?
            WHERE id = ?
          `, [
            masterItem.name,
            masterItem.category || '',
            masterItem.department || '',
            masterItem.unit || '',
            masterItem.minStock || 0,
            masterItem.ideal_stock,
            masterItem.max_stock,
            masterItem.supplier || '',
            masterItem.catalogNo || '',
            masterItem.brand || '',
            masterItem.storageLocation || '',
            masterItem.storageTemp || '',
            masterItem.chemicalType || '',
            masterItem.notes || '',
            req.user.username,
            itemId
          ]);
          updated++;
        } else {
          itemId = generateId();
          await run(conn, `
            INSERT INTO item_definitions (id, code, name, category, department, unit, minStock, ideal_stock, max_stock, supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, status, notes, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
          `, [
            itemId,
            code,
            masterItem.name,
            masterItem.category || '',
            masterItem.department || '',
            masterItem.unit || '',
            masterItem.minStock || 0,
            masterItem.ideal_stock,
            masterItem.max_stock,
            masterItem.supplier || '',
            masterItem.catalogNo || '',
            masterItem.brand || '',
            masterItem.storageLocation || '',
            masterItem.storageTemp || '',
            masterItem.chemicalType || '',
            masterItem.notes || '',
            req.user.username
          ]);
          created++;
        }

        for (const item of itemRows) {
          const lotNumber = item.lotNumber;
          if (!lotNumber) {
            errors.push(`Item ${code} row skipped: missing Lot No`);
            continue;
          }

          const qty = Math.max(item.initialStock || 0, 0);
          const status = qty > 0 ? 'ACTIVE' : 'DEPLETED';
          const existingLot = await all(conn, 'SELECT * FROM lots WHERE itemId = ? AND lotNumber = ?', [itemId, lotNumber]);

          if (existingLot.length) {
            const lotId = existingLot[0].id;
            await run(conn, `
              UPDATE lots SET 
                currentQuantity = ?,
                initialQuantity = ?,
                expiryDate = COALESCE(?, expiryDate),
                receivedDate = COALESCE(?, receivedDate),
                status = ?,
                updatedBy = ?
              WHERE id = ?
            `, [
              qty,
              qty,
              item.expiryDate,
              item.receivedDate,
              status,
              req.user.username,
              lotId
            ]);
            lotsUpdated++;
          } else {
            const lotId = generateId();
            await run(conn, `
              INSERT INTO lots (id, itemId, lotNumber, expiryDate, receivedDate, initialQuantity, currentQuantity, notes, createdBy, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'Excel import', ?, ?)
            `, [
              lotId,
              itemId,
              lotNumber,
              item.expiryDate,
              item.receivedDate,
              qty,
              qty,
              req.user.username,
              status
            ]);
            lotsCreated++;
          }
        }
      }

      return { created, updated, lotsCreated, lotsUpdated, errors };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to import items', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
  }
});

// ============================================================
// ANALYTICS - For Genel Stok Görünümü
// ============================================================

app.get('/api/analytics/overview', authRequired, async (_req, res) => {
  try {
    const [stockSummary, expiryAlerts, lowStock, recentActivity, departmentStats] = await Promise.all([
      // Total stock summary
      all(pool, `
        SELECT 
          COUNT(DISTINCT id.id) AS totalItems,
          COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS totalActiveLots,
          COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.currentQuantity ELSE 0 END), 0) AS totalStock
        FROM item_definitions id
        LEFT JOIN lots l ON id.id = l.itemId
        WHERE id.status = 'ACTIVE'
      `),
      // Expiry alerts (30 days)
      all(pool, `
        SELECT COUNT(*) AS count, 
          SUM(l.currentQuantity) AS quantity
        FROM lots l
        WHERE l.status = 'ACTIVE' 
          AND l.currentQuantity > 0 
          AND l.expiryDate IS NOT NULL 
          AND l.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND l.expiryDate >= CURDATE()
      `),
      // Low stock items
      all(pool, `
        SELECT COUNT(*) AS count FROM (
          SELECT id.id, id.minStock
          FROM item_definitions id
          LEFT JOIN lots l ON id.id = l.itemId
          WHERE id.status = 'ACTIVE'
          GROUP BY id.id, id.minStock
          HAVING COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) < id.minStock
        ) AS low_stock
      `),
      // Recent activity
      all(pool, `
        SELECT 'distribution' AS type, d.distributedDate AS date, d.itemName, d.quantity, d.receivedBy AS person
        FROM distributions d
        WHERE d.distributedDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'waste' AS type, w.disposedDate AS date, w.itemName, w.quantity, w.disposedBy AS person
        FROM waste_records w
        WHERE w.disposedDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 'receipt' AS type, l.createdAt AS date, id.name AS itemName, l.initialQuantity AS quantity, l.createdBy AS person
        FROM lots l
        JOIN item_definitions id ON l.itemId = id.id
        WHERE l.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY date DESC
        LIMIT 20
      `),
      // Department stats
      all(pool, `
        SELECT 
          COALESCE(id.department, 'Belirtilmemiş') AS department,
          COUNT(DISTINCT id.id) AS itemCount,
          COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.currentQuantity ELSE 0 END), 0) AS totalStock
        FROM item_definitions id
        LEFT JOIN lots l ON id.id = l.itemId
        WHERE id.status = 'ACTIVE'
        GROUP BY id.department
        ORDER BY totalStock DESC
      `)
    ]);

    res.json({
      summary: stockSummary[0],
      expiryAlerts: expiryAlerts[0],
      lowStockCount: lowStock[0]?.count || 0,
      recentActivity,
      departmentStats
    });
  } catch (error) {
    console.error('Failed to get analytics', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ============================================================
// EXCEL EXPORT ENDPOINTS - For Action Tracking Tabs
// ============================================================

// Export Purchase Requests (Satın Alma Talepleri)
app.get('/api/export/purchases', authRequired, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT 
        p.requestNumber AS 'Talep No',
        p.itemCode AS 'Malzeme Kodu',
        p.itemName AS 'Malzeme Adı',
        p.requestedQty AS 'Talep Miktarı',
        p.requestedBy AS 'Talep Eden',
        p.requestedAt AS 'Talep Tarihi',
        p.status AS 'Durum',
        p.approvedBy AS 'Onaylayan',
        p.approvedAt AS 'Onay Tarihi',
        p.orderedBy AS 'Sipariş Veren',
        p.orderedAt AS 'Sipariş Tarihi',
        p.supplierName AS 'Tedarikçi',
        p.poNumber AS 'PO No',
        p.orderedQty AS 'Sipariş Miktarı',
        p.receivedQtyTotal AS 'Teslim Alınan',
        p.notes AS 'Notlar'
      FROM purchases p
      WHERE 1=1
    `;
    
    if (status) {
      sql += ` AND p.status = ?`;
      const purchases = await all(pool, sql, [status]);
      return res.json({ purchases });
    }
    
    const purchases = await all(pool, sql);
    res.json({ purchases });
  } catch (error) {
    console.error('Export purchases error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Export Receipts (Teslim Kayıtları)
app.get('/api/export/receipts', authRequired, async (req, res) => {
  try {
    const receipts = await all(pool, `
      SELECT 
        r.receiptId AS 'Teslim No',
        p.requestNumber AS 'Talep No',
        p.itemCode AS 'Malzeme Kodu',
        p.itemName AS 'Malzeme Adı',
        r.lotNo AS 'LOT No',
        r.receivedQty AS 'Miktar',
        r.receivedBy AS 'Teslim Alan',
        r.receivedAt AS 'Teslim Tarihi',
        r.expiryDate AS 'SKT',
        r.invoiceNo AS 'Fatura No',
        l.receivedDate AS 'Alım Tarihi',
        p.supplierName AS 'Tedarikçi'
      FROM receipts r
      LEFT JOIN purchases p ON r.purchaseId = p.id
      LEFT JOIN lots l ON r.lotId = l.id
      ORDER BY r.receivedAt DESC
    `);
    res.json({ receipts });
  } catch (error) {
    console.error('Export receipts error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Export Distributions (Dağıtım Kayıtları)
app.get('/api/export/distributions', authRequired, async (req, res) => {
  try {
    const distributions = await all(pool, `
      SELECT 
        d.id AS 'Dağıtım No',
        d.itemCode AS 'Malzeme Kodu',
        d.itemName AS 'Malzeme Adı',
        d.lotNumber AS 'LOT No',
        d.quantity AS 'Miktar',
        d.distributedBy AS 'Dağıtan',
        d.distributedDate AS 'Dağıtım Tarihi',
        d.receivedBy AS 'Teslim Alan',
        u.department AS 'Departman',
        d.purpose AS 'Amaç',
        d.status AS 'Durum'
      FROM distributions d
      LEFT JOIN usage_records u ON d.itemId = u.itemId AND d.distributedDate = u.usedAt
      ORDER BY d.distributedDate DESC
    `);
    res.json({ distributions });
  } catch (error) {
    console.error('Export distributions error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Export Waste Records (Atık Kayıtları)
app.get('/api/export/waste', authRequired, async (req, res) => {
  try {
    const waste = await all(pool, `
      SELECT 
        w.id AS 'Atık No',
        w.itemCode AS 'Malzeme Kodu',
        w.itemName AS 'Malzeme Adı',
        w.lotNumber AS 'LOT No',
        w.quantity AS 'Miktar',
        w.wasteType AS 'Atık Tipi',
        w.reason AS 'Sebep',
        w.disposalMethod AS 'İmha Yöntemi',
        w.certificationNo AS 'Sertifika No',
        w.disposedBy AS 'Kaydeden',
        w.disposedDate AS 'Kayıt Tarihi',
        w.notes AS 'Notlar'
      FROM waste_records w
      ORDER BY w.disposedDate DESC
    `);
    res.json({ waste });
  } catch (error) {
    console.error('Export waste error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Export Usage Records (Kullanım Kayıtları)
app.get('/api/export/usage', authRequired, async (req, res) => {
  try {
    const usage = await all(pool, `
      SELECT 
        u.id AS 'Kullanım No',
        id.code AS 'Malzeme Kodu',
        id.name AS 'Malzeme Adı',
        l.lotNumber AS 'LOT No',
        u.quantityUsed AS 'Miktar',
        u.usedBy AS 'Kullanan',
        u.receivedBy AS 'Teslim Alan',
        u.department AS 'Departman',
        u.purpose AS 'Amaç',
        u.usedAt AS 'Kullanım Tarihi',
        u.notes AS 'Notlar'
      FROM usage_records u
      LEFT JOIN lots l ON u.lotId = l.id
      LEFT JOIN item_definitions id ON u.itemId = id.id
      ORDER BY u.usedAt DESC
    `);
    res.json({ usage });
  } catch (error) {
    console.error('Export usage error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Export Stock (Stok Takip)
app.get('/api/export/stock', authRequired, async (req, res) => {
  try {
    const stock = await all(pool, `
      SELECT 
        id.code AS 'Malzeme Kodu',
        id.name AS 'Malzeme Adı',
        id.category AS 'Kategori',
        id.department AS 'Departman',
        id.unit AS 'Birim',
        id.minStock AS 'Min Stok',
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.currentQuantity ELSE 0 END), 0) AS 'Mevcut Stok',
        id.storageLocation AS 'Depo Lokasyonu',
        id.supplier AS 'Tedarikçi',
        id.catalogNo AS 'Katalog No',
        id.brand AS 'Marka',
        id.storageTemp AS 'Saklama Sıcaklığı',
        MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) AS 'En Yakın SKT',
        COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS 'Aktif LOT Sayısı'
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      WHERE id.status = 'ACTIVE'
      GROUP BY id.id
      ORDER BY id.code
    `);
    res.json({ stock });
  } catch (error) {
    console.error('Export stock error:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Clear all data endpoint (for "Tümünü Temizle" button)
app.post('/api/clear-all', authRequired, adminRequired, async (req, res) => {
  try {
    await withTransaction(async (conn) => {
      // Delete all data from all tables
      const truncateTables = [
        'distribution_lots',
        'usage_records',
        'counting_records',
        'distributions',
        'receipts',
        'waste_records',
        'purchases',
        'lots'
      ];
      for (const table of truncateTables) {
        await run(conn, `DELETE FROM \`${table}\``);
      }
      await run(conn, "UPDATE item_definitions SET status = 'INACTIVE', totalStock = 0, activeLotCount = 0");
    });
    res.json({ status: 'cleared' });
  } catch (error) {
    console.error('Failed to clear all data', error);
    res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
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
