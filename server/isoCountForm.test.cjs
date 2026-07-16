// server/isoCountForm.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDateTR,
  formatExpiryBreakdown,
  stockStatusLabel,
  buildIsoRows,
} = require('./isoCountForm.cjs');

test('formatDateTR renders DD.MM.YYYY', () => {
  assert.equal(formatDateTR('2027-07-01T00:00:00.000Z'), '01.07.2027');
  assert.equal(formatDateTR(new Date(Date.UTC(2026, 0, 5))), '05.01.2026');
});

test('formatDateTR returns empty string for missing/invalid dates', () => {
  assert.equal(formatDateTR(null), '');
  assert.equal(formatDateTR(''), '');
  assert.equal(formatDateTR('not-a-date'), '');
});

test('formatExpiryBreakdown returns "Yok" when no lot has an expiry date', () => {
  assert.equal(formatExpiryBreakdown([]), 'Yok');
  assert.equal(formatExpiryBreakdown([{ expiryDate: null, currentQuantity: 5 }]), 'Yok');
});

test('formatExpiryBreakdown lists each dated lot as DD.MM.YYYYXQTY (uppercase X)', () => {
  const lots = [
    { expiryDate: '2026-03-01', currentQuantity: 2 },
    { expiryDate: '2027-07-01', currentQuantity: 3 },
  ];
  assert.equal(formatExpiryBreakdown(lots), '01.03.2026X2 01.07.2027X3');
});

test('formatExpiryBreakdown appends YokX<qty> for the undated portion of a mixed item', () => {
  const lots = [
    { expiryDate: '2026-03-01', currentQuantity: 2 },
    { expiryDate: '2027-07-01', currentQuantity: 3 },
    { expiryDate: null, currentQuantity: 5 },
    { expiryDate: null, currentQuantity: 4 },
  ];
  assert.equal(formatExpiryBreakdown(lots), '01.03.2026X2 01.07.2027X3 YokX9');
});

test('stockStatusLabel uses ideal stock as the threshold', () => {
  assert.equal(stockStatusLabel(1, 2, 1), 'SATINAL'); // below ideal
  assert.equal(stockStatusLabel(2, 2, 1), 'YETERLİ'); // meets ideal
});

test('stockStatusLabel falls back to minStock when ideal is null', () => {
  assert.equal(stockStatusLabel(0, null, 1), 'SATINAL');
  assert.equal(stockStatusLabel(5, null, 1), 'YETERLİ');
});

test('stockStatusLabel is YETERLİ when no threshold is set', () => {
  assert.equal(stockStatusLabel(0, null, null), 'YETERLİ');
});

test('buildIsoRows maps items to the 12 LY-F064 columns in order', () => {
  const rows = buildIsoRows([
    {
      code: '605001',
      catalogNo: '',
      name: 'Tube 0.6ml',
      brand: 'Nest',
      unit: 'Kutu',
      storageLocation: 'Raf1',
      storageTemp: 'RT',
      minStock: 1,
      ideal_stock: 2,
      max_stock: 3,
      shelfQty: 13,
      lots: [{ expiryDate: '2025-05-01', currentQuantity: 13 }],
    },
    {
      code: 'RNZ-01',
      catalogNo: 'R2020', // explicit catalogNo wins over code
      name: 'RNase Zap',
      brand: 'Sigma',
      unit: 'Adet',
      storageLocation: '',
      storageTemp: 'Buzdolabı',
      minStock: 2,
      ideal_stock: null,
      max_stock: 6,
      shelfQty: 5,
      lots: [],
    },
  ]);

  // catalogNo empty -> column B falls back to the system code
  assert.deepEqual(rows[0], [
    1, '605001', 'Tube 0.6ml', 'Nest', 13, 'Kutu', 'Raf1', '01.05.2025X13', 1, 2, 3, 'YETERLİ',
  ]);
  // catalogNo present -> wins over code; storageLocation empty -> falls back to
  // storageTemp; no dated lots -> "Yok"
  assert.deepEqual(rows[1], [
    2, 'R2020', 'RNase Zap', 'Sigma', 5, 'Adet', 'Buzdolabı', 'Yok', 2, '', 6, 'YETERLİ',
  ]);
});
