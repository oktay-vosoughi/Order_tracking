// server/mgTrackingForm.cjs
// Row-building + exceljs builder for the ISO "Malzeme Takip Listesi" (MG-F069)
// export. Two sheets, scoped to one department + year:
//   Sheet 1 "Malzeme Takip Listesi" — one row per talep (purchase request) with
//     its request→receive lifecycle columns and a Durum (status) column.
//   Sheet 2 "Dağıtım Listesi" — one row per CEP DEPO distribution (dağıt) event:
//     date, material, quantity in the stock unit, who distributed, recipient
//     technician, the linked talep number, and notes.
// See docs/superpowers/specs/2026-07-16-mg-f069-and-iso-forms-page-design.md

const ExcelJS = require('exceljs');
const { formatDateTR } = require('./isoCountForm.cjs');

// -- sheet 1: tracking list -------------------------------------------------

const TRACKING_SHEET = 'Malzeme Takip Listesi';
const TRACKING_HEADERS = [
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
  'Onay',
  'Durum',
];
const TRACKING_WIDTHS = [22, 14, 32, 11, 13, 13, 11, 15, 16, 20, 16, 12, 16];

// -- sheet 2: distribution list ---------------------------------------------

const DIST_SHEET = 'Dağıtım Listesi';
const DIST_HEADERS = [
  'Dağıtım Tarihi',
  'Malzeme Kodu',
  'Malzeme Tanımı',
  'Miktar (Stok Birim)',
  'Birim',
  'Dağıtan',
  'Alan Teknisyen',
  'Bağlı Talep No',
  'Not',
];
const DIST_WIDTHS = [15, 14, 32, 16, 12, 16, 18, 20, 30];

// Turkish status enums → human-readable Durum labels. "EBYS onay" in lab speak
// is the ONAYLANDI (approved) stage; there is no separate EBYS status.
const STATUS_LABELS = {
  TALEP_EDILDI: 'Talep Edildi',
  ONAYLANDI: 'Onaylandı',
  SIPARIS_VERILDI: 'Sipariş Verildi',
  KISMI_TESLIM: 'Kısmi Teslim',
  TESLIM_ALINDI: 'Teslim Alındı',
  REDDEDILDI: 'Reddedildi',
  IPTAL: 'İptal',
};

const txt = (v) => (v === null || v === undefined ? '' : v);
const statusLabel = (status) => STATUS_LABELS[status] || txt(status);

// tracking records: purchase rows. One 13-col array per talep.
function buildTrackingRows(records) {
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
    txt(r.approvedBy), // L
    statusLabel(r.status), // M — Durum
  ]);
}

// distribution records: CEP DEPO dağıt rows. One 9-col array per event.
function buildDistributionRows(records) {
  return (records || []).map((r) => [
    formatDateTR(r.distributedAt), // A
    txt(r.itemCode), // B
    txt(r.itemName), // C
    r.packQty ?? '', // D — quantity in the stock unit
    txt(r.unit), // E
    txt(r.distributedBy), // F
    txt(r.recipient), // G — recipient technician
    txt(r.requestNumber), // H — linked talep
    txt(r.notes), // I
  ]);
}

// -- workbook build ---------------------------------------------------------

const THIN_BORDER = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
  bottom: { style: 'thin' },
};

function addSheet(workbook, { name, title, headers, widths, rows }) {
  const ws = workbook.addWorksheet(name);
  ws.columns = widths.map((w) => ({ width: w }));
  const colCount = headers.length;

  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });
  headerRow.height = 28;

  rows.forEach((values, r) => {
    const row = ws.getRow(3 + r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.value = values[c - 1];
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  return ws;
}

// Builds the two-sheet workbook and returns an .xlsx Buffer.
async function buildMgWorkbook({ department, year, trackingRows, distributionRows }) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, {
    name: TRACKING_SHEET,
    title: `MALZEME TAKİP LİSTESİ — ${department} (${year})`,
    headers: TRACKING_HEADERS,
    widths: TRACKING_WIDTHS,
    rows: trackingRows,
  });
  addSheet(workbook, {
    name: DIST_SHEET,
    title: `DAĞITIM LİSTESİ — ${department} (${year})`,
    headers: DIST_HEADERS,
    widths: DIST_WIDTHS,
    rows: distributionRows,
  });
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  TRACKING_SHEET,
  TRACKING_HEADERS,
  DIST_SHEET,
  DIST_HEADERS,
  STATUS_LABELS,
  statusLabel,
  buildTrackingRows,
  buildDistributionRows,
  buildMgWorkbook,
};
