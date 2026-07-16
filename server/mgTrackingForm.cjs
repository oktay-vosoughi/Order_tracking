// server/mgTrackingForm.cjs
// Row-building + exceljs sheet builder for the ISO "Malzeme Takip Listesi"
// (MG-F069) export — the request→approve→receive→distribute→consume lifecycle
// log, one row per distribution event, scoped to one department + year.
// See docs/superpowers/specs/2026-07-16-mg-f069-and-iso-forms-page-design.md

const ExcelJS = require('exceljs');
const { formatDateTR } = require('./isoCountForm.cjs');

const SHEET_NAME = 'MALZEME TAKİP LİSTESİ';
const HEADERS = [
  'Talep Numarası',
  'Malzeme Kodu',
  'Malzeme Tanımı',
  'Talep Miktarı',
  'Talep Tarihi',
  'Geliş Tarihi',
  'Gelen Miktar',
  'Son Kullanma Tarihi',
  'Lot No',
  'Dağıtımcı Firma',
  'Depoya Teslim Alan',
  'Depodan Çıkış Tarihi',
  'Kullanım İçin Alan',
  'Bittiği Tarih',
  'Onay',
];
const COL_COUNT = HEADERS.length; // 15 (A..O)
const COL_WIDTHS = [22, 14, 32, 11, 13, 13, 11, 15, 16, 20, 16, 16, 16, 13, 12];

// -- pure helpers -----------------------------------------------------------

const txt = (v) => (v === null || v === undefined ? '' : v);

// records: joined purchase+distribution rows (see the SQL in index.js). Returns
// one 15-element array per record, columns A..O of the MG-F069 sheet.
function buildMgRows(records) {
  return (records || []).map((r) => [
    txt(r.requestNumber), // A
    txt(r.itemCode), // B
    txt(r.itemName), // C
    r.requestedQty ?? '', // D
    formatDateTR(r.requestedAt), // E
    formatDateTR(r.receivedDate), // F
    r.receivedQtyTotal ?? '', // G
    formatDateTR(r.expiryDate), // H
    txt(r.lotNo), // I
    txt(r.supplierName), // J
    txt(r.receivedBy), // K
    formatDateTR(r.distributedDate), // L
    txt(r.distributionReceivedBy), // M
    formatDateTR(r.distributionCompletedDate), // N
    txt(r.approvedBy), // O
  ]);
}

// -- workbook build ---------------------------------------------------------

const THIN_BORDER = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
  bottom: { style: 'thin' },
};

// Builds a fresh single-sheet workbook and returns an .xlsx Buffer.
async function buildMgWorkbook({ department, year, rows }) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(SHEET_NAME);
  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  // Title row (merged A1:O1)
  ws.mergeCells(1, 1, 1, COL_COUNT);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `MALZEME TAKİP LİSTESİ — ${department} (${year})`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  // Header row (row 2)
  const headerRow = ws.getRow(2);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });
  headerRow.height = 28;

  // Data rows (row 3+)
  rows.forEach((values, r) => {
    const row = ws.getRow(3 + r);
    for (let c = 1; c <= COL_COUNT; c++) {
      const cell = row.getCell(c);
      cell.value = values[c - 1];
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  SHEET_NAME,
  HEADERS,
  COL_COUNT,
  buildMgRows,
  buildMgWorkbook,
};
