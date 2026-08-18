import { buildLyF064Rows, isLyF064Sheet } from './lyF064Importer.mjs';

/**
 * Maps Turkish Excel column headers to the English keys expected by
 * POST /api/import-items.
 *
 * Accepts both the Turkish display names (used in the downloadable template)
 * and the English camelCase keys directly (for programmatic uploads).
 */
const DATE_FIELDS = new Set(['expiryDate', 'receivedDate']);

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Converts an Excel cell value to a timezone-safe 'YYYY-MM-DD' string.
 *
 * Excel stores dates as serial numbers. Reading them with cellDates:true
 * produces a JS Date built in the local timezone, which shifts the calendar
 * day across the UTC boundary (e.g. Aug 1 -> Jul 31 in UTC+3). We instead
 * convert the raw serial directly, preserving calendar components.
 */
function toSafeDate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).trim();
}

const COLUMN_MAP = {
  // Core item fields
  'Malzeme Kodu':      'code',
  'code':              'code',
  'Malzeme Adı':       'name',
  'name':              'name',
  'Kategori':          'category',
  'category':          'category',
  'Departman':         'department',
  'department':        'department',
  'Marka':             'brand',
  'brand':             'brand',
  'Birim':             'unit',
  'unit':              'unit',
  'Min Stok':          'minStock',
  'minStock':          'minStock',
  'İdeal Stok':                     'ideal_stock',
  'İdeal Stok Seviyesi':            'ideal_stock',
  'İdeal Stok Seviyesi (3 aylık)':  'ideal_stock',
  'ideal_stock':                    'ideal_stock',
  'Max Stok':                       'max_stock',
  'Maksimum Stok':                  'max_stock',
  'Maksimum Stok Seviyesi':         'max_stock',
  'max_stock':                      'max_stock',
  'Mevcut Stok':       'initialStock',
  'initialStock':      'initialStock',
  'Depo':              'storageLocation',
  'Buzdolabı/Dolap':   'storageLocation',
  'storageLocation':   'storageLocation',
  'Tedarikçi':         'supplier',
  'supplier':          'supplier',
  'Katalog No':        'catalogNo',
  'catalogNo':         'catalogNo',
  'Lot No':            'lotNumber',
  'lotNo':             'lotNumber',
  'lotNumber':         'lotNumber',
  'Son Kullanma':      'expiryDate',
  'expiryDate':        'expiryDate',
  'Açılış Tarihi':     'receivedDate',
  'receivedDate':      'receivedDate',
  'Saklama Sıcaklığı': 'storageTemp',
  'storageTemp':       'storageTemp',
  'Kimyasal Tipi':     'chemicalType',
  'chemicalType':      'chemicalType',
  'MSDS/SDS':          'msdsUrl',
  'msdsUrl':           'msdsUrl',
  'Notlar':            'notes',
  'notes':             'notes',

  // CEP DEPO main/sub-unit conversion
  'Ana Birim':         'packageUnit',
  'packageUnit':       'packageUnit',
  'Alt Birim':         'consumptionUnit',
  'consumptionUnit':   'consumptionUnit',
  '1 Ana = Kaç Alt':   'unitsPerPackage',
  '1 Ana = Kac Alt':   'unitsPerPackage',
  '1Ana=KacAlt':       'unitsPerPackage',
  '1 Ana Kac Alt':     'unitsPerPackage',
  'unitsPerPackage':   'unitsPerPackage',
  'Tüketim Tipi':      'consumptionUnitType',
  'Tuketim Tipi':      'consumptionUnitType',
  'TuketimTipi':       'consumptionUnitType',
  'consumptionUnitType': 'consumptionUnitType',
};

/**
 * Reads an Excel file and returns an array of row objects with English keys,
 * ready to POST to /api/import-items.
 *
 * @param {File} file - Browser File object (.xlsx / .xls)
 * @returns {Promise<Array<Object>>}
 */
export async function buildLotImportPayload(file) {
  if (!file || file.size > 5 * 1024 * 1024) {
    throw new Error('Excel dosyası en fazla 5 MB olabilir.');
  }
  const buffer = await file.arrayBuffer();
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  if (wb.worksheets.length > 20) throw new Error('Excel dosyası en fazla 20 sayfa içerebilir.');

  const allRows = [];

  for (const ws of wb.worksheets) {
    if (ws.rowCount > 20000) throw new Error(`"${ws.name}" sayfası 20.000 satır sınırını aşıyor.`);
    const matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      matrix.push(row.values.slice(1).map((value) => value?.result ?? value ?? ''));
    });
    if (isLyF064Sheet(matrix)) {
      allRows.push(...buildLyF064Rows(matrix, ws.name));
      continue;
    }
    const headers = (matrix[0] || []).map((value) => String(value).trim());
    const raw = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));

    for (const rawRow of raw) {
      const row = {};
      for (const [excelKey, value] of Object.entries(rawRow)) {
        const mappedKey = COLUMN_MAP[excelKey.trim()];
        if (mappedKey) {
          row[mappedKey] = DATE_FIELDS.has(mappedKey) ? toSafeDate(value) : value;
        }
      }
      // Skip completely empty rows
      if (!row.code && !row.name) continue;
      allRows.push(row);
    }
  }

  if (allRows.length === 0) {
    throw new Error(
      'Excel dosyasında geçerli satır bulunamadı. ' +
      '"Malzeme Kodu" ve "Malzeme Adı" sütunlarının mevcut olduğundan emin olun.'
    );
  }

  return allRows;
}
