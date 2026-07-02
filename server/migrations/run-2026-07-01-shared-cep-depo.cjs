/**
 * Runner for server/migrations/2026-07-01-shared-cep-depo.sql
 *
 * Usage (from the project root):
 *   1) DRY RUN (safe — only checks, changes nothing):
 *        node server/migrations/run-2026-07-01-shared-cep-depo.cjs
 *   2) ACTUALLY RUN the destructive migration (after you have a DB backup):
 *        node server/migrations/run-2026-07-01-shared-cep-depo.cjs --yes
 *
 * It reads DB credentials from server/.env (same as the app).
 * It ABORTS if any LAB_TECHNICIAN has no department (their pocket stock would be lost).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CONFIRM = process.argv.includes('--yes');
const SQL_FILE = path.join(__dirname, '2026-07-01-shared-cep-depo.sql');

(async () => {
  const cfg = {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  };
  console.log(`Target DB: ${cfg.host}:${cfg.port}/${cfg.database}`);
  const conn = await mysql.createConnection(cfg);

  // --- Pre-flight safety check: any lab tech without a department? ---
  const [unassigned] = await conn.query(
    "SELECT id, username FROM users WHERE role='LAB_TECHNICIAN' AND (department IS NULL OR department='')"
  );
  if (unassigned.length) {
    console.error('\nABORTED — these LAB_TECHNICIAN users have no department:');
    unassigned.forEach(u => console.error(`   - id=${u.id} ${u.username}`));
    console.error('\nAssign each of them a department first (Users tab in the app, or:');
    console.error("   UPDATE users SET department='Molecular Micro' WHERE username='lab1';)");
    console.error('then re-run this script.\n');
    await conn.end();
    process.exit(1);
  }
  console.log('Pre-flight OK: every lab technician has a department.');

  // --- Detect an already-migrated table (labTechnicianId dropped) and stop cleanly. ---
  const [balCols] = await conn.query('SHOW COLUMNS FROM cep_depo_balances');
  const balColNames = balCols.map(c => c.Field);
  if (!balColNames.includes('labTechnicianId')) {
    const [pools] = await conn.query('SELECT department, COUNT(*) AS items FROM cep_depo_balances GROUP BY department');
    console.log('\nAlready migrated — cep_depo_balances is keyed by department (no labTechnicianId column).');
    console.log('Nothing to do. Current department pools:', JSON.stringify(pools));
    await conn.end();
    return;
  }

  // --- Show what will be merged ---
  const [preview] = await conn.query(`
    SELECT u.department, COUNT(*) AS balanceRows, SUM(b.packQty) AS totalPack, SUM(b.unitQty) AS totalUnit
    FROM cep_depo_balances b JOIN users u ON u.id = b.labTechnicianId
    WHERE b.department IS NULL
    GROUP BY u.department`);
  if (preview.length) {
    console.log('\nBalances that will be merged into department pools:');
    preview.forEach(r => console.log(`   ${r.department}: ${r.balanceRows} row(s), pack=${r.totalPack}, unit=${r.totalUnit}`));
  } else {
    console.log('\nNo legacy per-tech balances to merge (fresh or already migrated).');
  }

  if (!CONFIRM) {
    console.log('\nDRY RUN complete. No changes made.');
    console.log('To run the migration for real:  node server/migrations/run-2026-07-01-shared-cep-depo.cjs --yes');
    console.log('(Make sure you have a database backup first.)');
    await conn.end();
    return;
  }

  // --- Execute the migration file ---
  console.log('\nRunning migration...');
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  await conn.query(sql);

  // --- Verify ---
  const [cols] = await conn.query('SHOW COLUMNS FROM cep_depo_balances');
  const names = cols.map(c => c.Field);
  const [pools] = await conn.query(
    'SELECT department, COUNT(*) AS items FROM cep_depo_balances GROUP BY department');
  console.log('\nMigration complete.');
  console.log('  labTechnicianId dropped from balances:', !names.includes('labTechnicianId'));
  console.log('  department column present:', names.includes('department'));
  console.log('  department pools:', JSON.stringify(pools));
  await conn.end();
})().catch(e => { console.error('MIGRATION ERROR:', e.message); process.exit(2); });
