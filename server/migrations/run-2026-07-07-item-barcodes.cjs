const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '2026-07-07-item-barcodes.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'order_Tracking',
    multipleStatements: true
  });
  await conn.query(sql);
  const [rows] = await conn.query("SHOW TABLES LIKE 'item_barcodes'");
  console.log(rows.length ? 'OK: item_barcodes exists' : 'FAILED: table missing');
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
