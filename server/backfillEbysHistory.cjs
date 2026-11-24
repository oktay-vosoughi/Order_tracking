'use strict';

// One-off: load pre-migration EBYS requests (PDF forms + MG-F069 Excel) as purchases.
//   node server/backfillEbysHistory.cjs --xlsx <MG-F069.xlsx> [--report out.csv] [--overrides map.json] [--apply]
// Dry-run by default. Creates NO lots / stock: received lines are history only.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { DEPARTMENT, MARKER, ACTOR, isoDate, buildPlan } = require('./ebysHistoryBackfill.cjs');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes('--apply');
const DEPT = opt('--department') || DEPARTMENT; // e.g. "Moleküler Mikro"
const DEPT_CODE = { 'Moleküler Genetik': 'MG', 'Moleküler Mikro': 'MM' }[DEPT];
if (!DEPT_CODE) { console.error('--department yalnızca "Moleküler Genetik" veya "Moleküler Mikro" olabilir'); process.exit(1); }
// Genetik keeps its original GECIS-BEDELSIZ-NN numbering; Mikro uses GECIS-BEDELSIZ-MM-NN.
const FREE_PREFIX = DEPT_CODE === 'MM' ? 'GECIS-BEDELSIZ-MM-' : 'GECIS-BEDELSIZ-';
const pdfsJsonPath = opt('--pdfs-json') || path.join(__dirname, 'data', 'ebys-history-pdfs.json');
const sheetName = opt('--sheet') || '2026';
const xlsxPath = opt('--xlsx');
const rowsJsonPath = opt('--rows-json'); // pre-extracted Excel rows (see --dump-rows)
if (!xlsxPath && !rowsJsonPath) { console.error('--xlsx <dosya> veya --rows-json <dosya> zorunlu'); process.exit(1); }

const cell = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? '') : v);

async function readExcelRows() {
  if (rowsJsonPath) return JSON.parse(fs.readFileSync(rowsJsonPath, 'utf8'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Excel'de '${sheetName}' sayfası yok`);
  const rows = [];
  ws.eachRow((r) => {
    const v = r.values.map(cell);
    const raw = String(v[1] ?? '').trim();
    const m = raw.match(/^\d{6}-\d{6}/);
    if (!m && !/^bedels[iİ]z/i.test(raw)) return;
    rows.push({
      talepNo: m ? m[0] : 'BEDELSIZ', code: v[2], name: String(v[3] ?? '').trim(), requested: v[4],
      receivedDate: isoDate(v[6]), receivedQty: v[7], expiry: isoDate(v[8]), lot: v[9],
      supplier: v[10], receivedBy: v[11],
    });
  });
  return rows;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const pdfs = JSON.parse(fs.readFileSync(pdfsJsonPath, 'utf8'));
  const overridesPath = opt('--overrides');
  const overrides = overridesPath ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
  const excelRows = await readExcelRows();
  const dumpPath = opt('--dump-rows');
  if (dumpPath) { fs.writeFileSync(dumpPath, JSON.stringify(excelRows)); console.log(`Excel satırları yazıldı: ${dumpPath} (${excelRows.length})`); return; }
  const pdfNos = new Set(pdfs.map((p) => p.talepNo));
  const excelOnlyTalepNos = [...new Set(excelRows.map((r) => r.talepNo))].filter((n) => n !== 'BEDELSIZ' && !pdfNos.has(n));

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost', port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'order_Tracking',
  });
  try {
    if (args.includes('--verify')) {
      const [rows] = await conn.query('SELECT ebysReference r, COUNT(*) n, SUM(status = ?) teslim, SUM(status = ?) kismi, SUM(status = ?) bekleyen FROM purchases WHERE ebysReference IS NOT NULL GROUP BY ebysReference', ['TESLIM_ALINDI', 'KISMI_TESLIM', 'SIPARIS_VERILDI']);
      const db = new Map(rows.map((r) => [r.r, r]));
      let ok = 0; const sorun = [];
      for (const p of pdfs) {
        const r = db.get(p.talepNo);
        if (!r) sorun.push(`${p.talepNo}: SİSTEMDE YOK (PDF ${p.items.length} kalem)`);
        else if (Number(r.n) < p.items.length) sorun.push(`${p.talepNo}: PDF ${p.items.length} kalem, sistemde ${r.n} -> ${p.items.length - Number(r.n)} eksik`);
        else ok += 1;
      }
      console.log(`PDF talep: ${pdfs.length} | tam: ${ok} | sorunlu: ${sorun.length}`);
      sorun.forEach((x) => console.log('  ' + x));
      return;
    }
    const [itemDefs] = await conn.query('SELECT id, code, name, department FROM item_definitions');
    const [refRows] = await conn.query(
      'SELECT ebysReference r FROM ebys_batches WHERE ebysReference IS NOT NULL UNION SELECT ebysReference FROM purchases WHERE ebysReference IS NOT NULL UNION SELECT \'BEDELSIZ\' FROM purchases WHERE requestNumber LIKE ? AND (? = \'MM\' OR requestNumber NOT LIKE \'GECIS-BEDELSIZ-MM-%\') LIMIT 1000', [`${FREE_PREFIX}%`, DEPT_CODE]);
    const plan = buildPlan({ pdfs, excelRows, itemDefs, existingRefs: refRows.map((r) => r.r), overrides, excelOnlyTalepNos, department: DEPT });

    const lines = plan.flatMap((t) => (t.lines || []).map((l) => ({ t, l })));
    const importable = lines.filter(({ l }) => (l.item || l.newItem));
    const count = (s) => importable.filter(({ l }) => l.status === s).length;
    console.log(`Talep: ${plan.length} (atlanan: ${plan.filter((t) => t.skipped).length}) | kalem: ${lines.length} | yüklenecek: ${importable.length}`);
    console.log(`  TESLIM_ALINDI ${count('TESLIM_ALINDI')} | KISMI_TESLIM ${count('KISMI_TESLIM')} | SIPARIS_VERILDI ${count('SIPARIS_VERILDI')}`);
    console.log(`  Yeni kalem tanımı açılacak: ${new Set(importable.filter(({ l }) => !l.item).map(({ l }) => l.newItem.code)).size} | tanımsız (atlanır): ${lines.filter(({ l }) => !l.item && !l.newItem).length} | İhale (beklemede): ${lines.filter(({ l }) => l.warnings.includes('IHALE_BEKLEMEDE')).length}`);

    const reportPath = opt('--report');
    if (reportPath) {
      const head = ['talepNo', 'kaynak', 'durum', 'pdfKalem', 'sistemKodu', 'talepMiktar', 'gelenMiktar', 'gelisTarihi', 'lot', 'skt', 'firma', 'uyari'];
      const body = lines.map(({ t, l }) => [t.talepNo, t.source, l.status, l.pdfName || (l.item || l.newItem)?.name, (l.item || l.newItem)?.code, l.requestedQty, l.receivedQty, l.receivedDate, l.lotNo, l.expiryDate, l.supplierName, [...l.warnings, ...(l.newItem ? ['YENI_KALEM_TANIMI'] : [])].join(';')].map(csvCell).join(','));
      fs.writeFileSync(reportPath, [head.join(','), ...body].join('\n'));
      console.log(`Rapor: ${reportPath}`);
    }
    // Completeness check: every PDF line must be loaded; Excel lines of a PDF talep with no PDF line are listed.
    const eksik = [];
    for (const t of plan.filter((p) => !p.skipped)) {
      const pdf = pdfs.find((p) => p.talepNo === t.talepNo);
      const yuklenecek = t.lines.filter((l) => l.item || l.newItem).length;
      if (pdf && pdf.items.length !== yuklenecek) eksik.push(`${t.talepNo}: PDF ${pdf.items.length} kalem, yüklenecek ${yuklenecek}`);
      for (const x of t.excelOnly || []) eksik.push(`${t.talepNo}: Excel'de var, PDF'te yok -> ${x}`);
    }
    for (const t of plan.filter((p) => p.skipped)) eksik.push(`${t.talepNo}: zaten sistemde (atlandı)`);
    const bad = lines.filter(({ l }) => l.warnings.includes('GELIS_TARIHI_GECERSIZ')).map(({ t, l }) => `${t.talepNo}: geliş tarihi geçersiz -> ${(l.item || l.newItem)?.code}`);
    console.log(eksik.length || bad.length ? `\nEKSİK / KONTROL ET (${eksik.length + bad.length}):\n  ${[...eksik, ...bad].join('\n  ')}` : '\nEKSİK KONTROLÜ: eksik kalem yok, tüm PDF kalemleri yüklenecek.');

    if (!APPLY) { console.log('DRY-RUN: veritabanına yazılmadı. Yüklemek için --apply ekleyin.'); return; }

    await conn.beginTransaction();
    try {
      const created = new Map();
      for (const { l } of importable.filter(({ l }) => !l.item)) {
        const key = l.newItem.code.toLowerCase();
        const existing = itemDefs.find((d) => String(d.code).toLowerCase() === key);
        if (existing) created.set(key, { id: existing.id, code: existing.code, name: existing.name });
        if (!created.has(key)) {
          const id = crypto.randomUUID();
          await conn.execute(
            "INSERT INTO item_definitions (id, code, name, category, department, unit, minStock, consumptionUnitType, minReactionThreshold, status, createdBy, notes) VALUES (?, ?, ?, '', ?, ?, 0, 'PACK', 3, 'ACTIVE', ?, ?)",
            [id, l.newItem.code, l.newItem.name, DEPT, l.unit || '', ACTOR, `${MARKER} geçiş aktarımında otomatik açıldı`]);
          created.set(key, { id, code: l.newItem.code, name: l.newItem.name });
        }
        l.item = created.get(key);
      }
      for (const t of plan.filter((p) => !p.skipped)) {
        const rows = t.lines.filter((l) => (l.item || l.newItem));
        if (!rows.length) continue;
        const batchId = t.noBatch ? null : `GECIS-${t.talepNo}`;
        if (batchId) {
          await conn.execute('INSERT INTO ebys_batches (id, ebysReference, createdBy, approvedBy, approvedAt) VALUES (?, ?, ?, ?, ?)',
            [batchId, t.talepNo, ACTOR, ACTOR, t.dateTime]);
        }
        let n = 0;
        for (const l of rows) {
          n += 1;
          const receivedAt = l.receivedDate ? `${l.receivedDate} 00:00:00` : null;
          await conn.execute(`
            INSERT INTO purchases (
              id, requestNumber, ebysBatchId, ebysReference, itemId, itemCode, itemName, department,
              requestedQty, requestedBy, requestedAt, requestDate, status, notes,
              approvedBy, approvedAt, approvedDate, orderedBy, orderedAt, orderedDate, supplierName, orderedQty,
              receivedQtyTotal, receivedBy, receivedDate, lotNo, expiryDate
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
            crypto.randomUUID(), t.noBatch ? `${FREE_PREFIX}${String(n).padStart(2, '0')}` : `GECIS-${t.talepNo}-${String(n).padStart(2, '0')}`, batchId, t.noBatch ? null : t.talepNo,
            l.item.id, l.item.code, l.item.name, DEPT,
            l.requestedQty, ACTOR, t.dateTime, t.date, l.status, `${MARKER} ${t.noBatch ? 'BEDELSİZ ' : ''}${l.unit || ''}${t.source === 'EXCEL' ? " PDF yok - Excel'den aktarıldı" : ''}`.trim(),
            ACTOR, t.dateTime, t.date, ACTOR, t.dateTime, t.date, l.supplierName, l.requestedQty,
            l.receivedQty, l.receivedBy, receivedAt, l.lotNo, l.expiryDate,
          ]);
        }
      }
      await conn.commit();
      console.log('YÜKLENDİ.');
    } catch (e) { await conn.rollback(); throw e; }
  } finally { await conn.end(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
