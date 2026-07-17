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

// Turkish status enums → Durum labels. MUST match the UI badges in
// src/mobileUi.mjs (PURCHASE_STATUS_BADGES) so the Excel reads the same as the
// Satın Alma Talepleri screen (e.g. TALEP_EDILDI shows as "EBYS bekleme",
// TESLIM_ALINDI as "Tamamlandı"). Keep in sync if those labels change.
const STATUS_LABELS = {
  TALEP_EDILDI: 'EBYS bekleme',
  ONAYLANDI: 'Onaylandı',
  SIPARIS_VERILDI: 'Sipariş Verildi',
  KISMI_TESLIM: 'Kısmen Geldi',
  KISMEN_GELDI: 'Kısmen Geldi',
  TESLIM_ALINDI: 'Tamamlandı',
  GELDI: 'Tamamlandı',
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

// Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ]. Ensure unique.
function safeSheetName(base, used) {
  let name = String(base).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` ${n}`;
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

// Builds the workbook and returns an .xlsx Buffer.
// groups: [{ department, trackingRows, distributionRows }]. With a single group
// the sheets keep their plain names; with several (all-departments export) each
// department gets its own pair of sheets, prefixed with the department name so
// every department is listed separately.
async function buildMgWorkbook({ year, groups }) {
  const workbook = new ExcelJS.Workbook();
  const single = groups.length === 1;
  const used = new Set();

  for (const g of groups) {
    addSheet(workbook, {
      name: safeSheetName(single ? TRACKING_SHEET : `Takip - ${g.department}`, used),
      title: `MALZEME TAKİP LİSTESİ — ${g.department} (${year})`,
      headers: TRACKING_HEADERS,
      widths: TRACKING_WIDTHS,
      rows: g.trackingRows,
    });
    addSheet(workbook, {
      name: safeSheetName(single ? DIST_SHEET : `Dağıtım - ${g.department}`, used),
      title: `DAĞITIM LİSTESİ — ${g.department} (${year})`,
      headers: DIST_HEADERS,
      widths: DIST_WIDTHS,
      rows: g.distributionRows,
    });
  }
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
