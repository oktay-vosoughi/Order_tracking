// server/isoCountForm.cjs
// Row-building logic + exceljs template fill for the ISO "Malzeme Sayım Formu" (LY-F064).
// See docs/superpowers/specs/2026-07-14-iso-count-form-export-design.md
//
// The .xlsx template is a controlled ISO document — we only write into the
// header date cell and the data rows; everything else (borders, header block,
// logo, column headers) is preserved as-is from the template file.

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'LY-F064_MALZEME_SAYIM_FORMU.xlsx');
const SHEET_NAME = 'Sayfa1';
const DATA_START_ROW = 10; // row 9 holds the column headers
const DATA_COL_COUNT = 12; // columns A..L

// -- pure helpers -----------------------------------------------------------

function formatDateTR(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Per-lot expiry breakdown for the "Son Kullanma Tarihi" column, matching the
// hand-maintained form's "<SKT>X<adet>" convention (uppercase X is the quantity
// multiplier). lots: [{ expiryDate, currentQuantity }] in FEFO order. Expired
// lots are included on purpose — the form is a physical shelf count.
//   - all lots undated               -> "Yok"
//   - dated lots                     -> "01.05.2026X1 09.2027X3"
//   - mix of dated + undated lots    -> "01.05.2026X1 YokX4"  (undated qty summed)
function formatExpiryBreakdown(lots) {
  const list = lots || [];
  const dated = list.filter((l) => l.expiryDate);
  const undatedQty = list
    .filter((l) => !l.expiryDate)
    .reduce((sum, l) => sum + Number(l.currentQuantity || 0), 0);
  if (dated.length === 0) return 'Yok';
  const parts = dated.map((l) => `${formatDateTR(l.expiryDate)}X${Number(l.currentQuantity)}`);
  if (undatedQty > 0) parts.push(`YokX${undatedQty}`);
  return parts.join(' ');
}

// "Stok Durumu" column: SATINAL below the ideal (fallback: critical) level,
// otherwise YETERLİ. Mirrors the SATIN_AL logic in /api/unified-stock.
function stockStatusLabel(shelfQty, idealStock, minStock) {
  const threshold = idealStock ?? minStock;
  if (threshold !== null && threshold !== undefined && Number(shelfQty) < Number(threshold)) {
    return 'SATINAL';
  }
  return 'YETERLİ';
}

// items: [{ catalogNo, name, brand, unit, storageLocation, storageTemp,
//           minStock, ideal_stock, max_stock, shelfQty, lots: [...] }]
// Returns one array per data row, columns A..L of the LY-F064 sheet.
function buildIsoRows(items) {
  return (items || []).map((item, index) => [
    index + 1, // A: Sıra No
    item.catalogNo || item.code || '', // B: Katolog Numarası (system "Kod"; catalogNo is unused/empty)
    item.name || '', // C: Malzeme Adı
    item.brand || '', // D: Marka
    Number(item.shelfQty) || 0, // E: Depo (physical count incl. expired)
    item.unit || '', // F: Birim
    item.storageLocation || item.storageTemp || '', // G: Buzdolabı/Dolap
    formatExpiryBreakdown(item.lots), // H: Son Kullanma Tarihi
    item.minStock ?? '', // I: Kritik Stok Seviyesi
    item.ideal_stock ?? '', // J: İdeal Stok Seviyesi (3 aylık)
    item.max_stock ?? '', // K: Maksimum Stok Seviyesi
    stockStatusLabel(item.shelfQty, item.ideal_stock, item.minStock), // L: Stok Durumu
  ]);
}

// -- template fill ----------------------------------------------------------

// Fills the controlled template and returns an .xlsx Buffer.
// rows: output of buildIsoRows(). countDate: Date for the header block.
async function fillIsoCountForm({ countDate, rows, templatePath = TEMPLATE_PATH }) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`ISO count form template missing on disk: ${templatePath}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) {
    throw new Error(`ISO count form template has no "${SHEET_NAME}" sheet`);
  }

  // Header block: fill the count date, blank the hand-signed fields. These are
  // merged cells; writing the top-left master cell is enough.
  ws.getCell('G3').value = `\nSayımın Yapıldığı\nTarih: ${formatDateTR(countDate)}`;
  ws.getCell('I3').value = '\nSayımı Yapan: ';
  ws.getCell('I6').value = 'Onay: ';
  ws.getCell('A3').value = '\nAçıklama: ';

  // Capture the first template data row's cell styles so rows we write —
  // including any beyond the template's pre-formatted range — keep the
  // controlled form's borders and fonts.
  const templateRow = ws.getRow(DATA_START_ROW);
  const columnStyles = [];
  for (let c = 1; c <= DATA_COL_COUNT; c++) {
    columnStyles[c] = templateRow.getCell(c).style;
  }
  const templateRowHeight = templateRow.height;

  // Clear the template's leftover sample rows (values only, keep formatting).
  for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= DATA_COL_COUNT; c++) {
      row.getCell(c).value = null;
    }
  }

  rows.forEach((values, i) => {
    const row = ws.getRow(DATA_START_ROW + i);
    for (let c = 1; c <= DATA_COL_COUNT; c++) {
      const cell = row.getCell(c);
      cell.style = columnStyles[c];
      cell.value = values[c - 1];
    }
    if (templateRowHeight) row.height = templateRowHeight;
    row.commit();
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  TEMPLATE_PATH,
  formatDateTR,
  formatExpiryBreakdown,
  stockStatusLabel,
  buildIsoRows,
  fillIsoCountForm,
};
