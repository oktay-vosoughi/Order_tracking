'use strict';

// One-off: reconcile an LY-F064 count against EXISTING lots of one department.
//   node server/reconcileCountLots.cjs --xlsx <sayim.xlsx> --department "Moleküler Mikro" [--force KOD1,KOD2] [--keep-lots KOD1,KOD2] [--report out.csv] [--rollback rb.sql] [--apply]
// Dry-run by default. Master data (item_definitions) is NOT touched; items missing
// from the DB are reported as ITEM_YOK and must be created via the normal Excel import.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { planReconcile, q2 } = require('./countReconcile.cjs');
const { normalizeImportDepartment } = require('./importDepartment.cjs');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes('--apply');
const xlsxPath = opt('--xlsx');
const DEPT = normalizeImportDepartment(opt('--department'));
const FORCE = (opt('--force') || '').split(',').map((s) => s.trim()).filter(Boolean);
const KEEP = (opt('--keep-lots') || '').split(',').map((s) => s.trim()).filter(Boolean);
const ACTOR = 'count-reconcile';
if (!xlsxPath || !DEPT) { console.error('--xlsx <dosya> ve geçerli --department zorunlu'); process.exit(1); }

const sqlStr = (v) => (v == null ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const dateStr = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : (v ? String(v).slice(0, 10) : ''));

async function readCountLots() {
  const { buildLyF064Rows, isLyF064Sheet } = await import(path.join(__dirname, '..', 'src', 'utils', 'lyF064Importer.mjs'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const out = [];
  for (const ws of wb.worksheets) {
    const matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      matrix.push(row.values.slice(1).map((v) => {
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          if ('result' in v) return v.result ?? '';
          if (v.richText) return v.richText.map((p) => p.text).join('');
          if ('text' in v) return v.text;
        }
        return v ?? '';
      }));
    });
    if (isLyF064Sheet(matrix)) out.push(...buildLyF064Rows(matrix, ws.name));
  }
  if (!out.length) throw new Error('Excel\'de LY-F064 sayım satırı bulunamadı.');
  return out;
}

async function main() {
  const rows = await readCountLots();
  const countLots = rows.map((r) => ({ code: r.code, expiryDate: r.expiryDate, quantity: r.initialStock, row: r }));
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost', port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'order_Tracking',
  });
  try {
    const codes = [...new Set(countLots.map((l) => l.code))];
    const [items] = await conn.query('SELECT id, code, unit FROM item_definitions WHERE code IN (?)', [codes]);
    const db = new Map(items.map((i) => [i.code, { id: i.id, unit: i.unit, lots: [] }]));
    if (items.length) {
      const [lots] = await conn.query(
        'SELECT id, itemId, lotNumber, expiryDate, currentQuantity, initialQuantity, status, department FROM lots WHERE department = ? AND itemId IN (?)',
        [DEPT, items.map((i) => i.id)]);
      const byId = new Map(items.map((i) => [i.id, db.get(i.code)]));
      lots.forEach((l) => byId.get(l.itemId).lots.push({ ...l, expiryDate: dateStr(l.expiryDate), currentQuantity: Number(l.currentQuantity) }));
    }
    const plan = planReconcile(countLots, db, { force: FORCE, keep: KEEP });
    const lines = ['KOD;DURUM;ISLEM;LOT;SKT;ESKI;YENI;NOT'];
    const stat = {};
    for (const p of plan) {
      stat[p.state] = (stat[p.state] || 0) + 1;
      if (p.state === 'MANUEL') {
        const pr = p.proposal;
        pr.zero.forEach((l) => lines.push([p.code, 'MANUEL', 'ONERI:SIFIRLA', l.lotNumber, l.expiryDate, l.currentQuantity, 0].join(';')));
        pr.create.forEach((g) => lines.push([p.code, 'MANUEL', 'ONERI:YENI', '', g.expiryDate, '', g.quantity].join(';')));
        pr.update.forEach((a) => lines.push([p.code, 'MANUEL', 'ONERI:GUNCELLE', a.lot.lotNumber, a.lot.expiryDate, a.from, a.to].join(';')));
        if (p.ambiguous) lines.push([p.code, 'MANUEL', 'AYNI SKT\'DE BIRDEN FAZLA STOKLU LOT', '', '', '', ''].join(';'));
        continue;
      }
      for (const a of p.actions) lines.push([p.code, p.state, a.type, a.lot?.lotNumber || '', a.lot?.expiryDate ?? a.group?.expiryDate ?? '', a.from ?? '', a.to, a.note || ''].join(';'));
      if (!p.actions.length) lines.push([p.code, p.state, '-', '', '', '', ''].join(';'));
    }
    console.log(`Departman: ${DEPT} | Excel malzeme: ${plan.length}`);
    console.log('Durumlar:', JSON.stringify(stat));
    console.log(lines.join('\n'));
    const reportPath = opt('--report'); if (reportPath) fs.writeFileSync(reportPath, '﻿' + lines.map((l) => l.split(';').map(csv).join(';')).join('\n'));

    const [unlisted] = await conn.query(
      `SELECT i.code, ROUND(SUM(l.currentQuantity),2) qty FROM lots l JOIN item_definitions i ON i.id = l.itemId
       WHERE l.department = ? AND l.currentQuantity > 0 AND i.code NOT IN (?) GROUP BY i.code`, [DEPT, codes]);
    if (unlisted.length) console.log(`\nSayımda OLMAYAN ama ${DEPT} stoğu olan ${unlisted.length} malzeme (dokunulmaz):\n` + unlisted.map((u) => `  ${u.code}: ${u.qty}`).join('\n'));

    if (!APPLY) { console.log('\nDRY-RUN: veritabanına yazılmadı. Uygulamak için --apply ekleyin.'); return; }

    const rb = [`-- Rollback ${new Date().toISOString()} (${DEPT})`];
    await conn.beginTransaction();
    try {
      for (const p of plan) {
        for (const a of p.actions) {
          if (a.type === 'SET_QTY' || a.type === 'ZERO') {
            rb.push(`UPDATE lots SET currentQuantity=${a.lot.currentQuantity}, status=${sqlStr(a.lot.status)} WHERE id=${sqlStr(a.lot.id)};`);
            await conn.query('UPDATE lots SET currentQuantity=?, status=?, updatedBy=? WHERE id=?',
              [a.to, a.to > 0 ? 'ACTIVE' : 'DEPLETED', ACTOR, a.lot.id]);
          } else if (a.type === 'CREATE') {
            const r = a.group.sample.row;
            const id = crypto.randomUUID();
            rb.push(`DELETE FROM lots WHERE id=${sqlStr(id)};`);
            await conn.query(
              `INSERT INTO lots (id,itemId,lotNumber,expiryDate,receivedDate,initialQuantity,currentQuantity,department,notes,createdBy,status,location,storageLocation)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [id, p.itemId, r.lotNumber, a.group.expiryDate || null, r.receivedDate || new Date().toISOString().slice(0, 10),
                a.to, a.to, DEPT, 'Sayım uzlaştırma (LY-F064)', ACTOR, a.to > 0 ? 'ACTIVE' : 'DEPLETED', r.lotLocation || null, r.lotStorageLocation || null]);
          }
        }
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    const rbPath = opt('--rollback') || `reconcile_rollback_${Date.now()}.sql`;
    fs.writeFileSync(rbPath, rb.join('\n') + '\n');
    console.log(`\nUYGULANDI. Rollback SQL: ${rbPath}`);
  } finally { await conn.end(); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
