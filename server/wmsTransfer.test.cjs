'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WMS_DEPARTMENT_ADDRESS,
  resolveDepartmentAddress,
  resolveWmsItemCode,
  resolveWmsUnit,
  buildTransferWorkOrder,
  buildWmsCatalog,
  allocateLots,
  formatOwnSlipNumber,
  extractSlipNumber
} = require('./wmsTransfer.cjs');

test('every canonical department maps to its WMS address', () => {
  assert.equal(resolveDepartmentAddress('Moleküler Genetik'), '01.201.02');
  assert.equal(resolveDepartmentAddress('Moleküler Mikro'), '01.201.03');
  assert.equal(resolveDepartmentAddress('SİTOGENETİK'), '01.201.04');
  assert.equal(resolveDepartmentAddress('Numune Kabul'), '01.201.05');
  assert.equal(Object.keys(WMS_DEPARTMENT_ADDRESS).length, 4);
});

test('unknown or empty department is rejected, never guessed', () => {
  assert.throws(() => resolveDepartmentAddress('Başka Bölüm'), (e) => e.error === 'WMS_UNKNOWN_DEPARTMENT');
  assert.throws(() => resolveDepartmentAddress(''), (e) => e.error === 'WMS_UNKNOWN_DEPARTMENT');
});

test('WMS item code prefers a registered GTIN barcode, then a GTIN item code', () => {
  assert.equal(resolveWmsItemCode({ code: 'KIT-1', barcodes: ['ABC', '8699844771935'] }), '8699844771935');
  assert.equal(resolveWmsItemCode({ code: '8697637750242', barcodes: [] }), '8697637750242');
  assert.equal(resolveWmsItemCode({ code: '8697637750242' }), '8697637750242');
});

test('an item created from the WMS is sent with its own WMS code, even when not a GTIN', () => {
  assert.equal(resolveWmsItemCode({ code: 'KRBYKDGR0000010', barcodes: [], fromWms: true }), 'KRBYKDGR0000010');
  assert.throws(() => resolveWmsItemCode({ code: 'KRBYKDGR0000010', barcodes: [] }), (e) => e.error === 'WMS_ITEM_CODE_MISSING');
  assert.throws(() => resolveWmsItemCode({ code: '', fromWms: true }), (e) => e.error === 'WMS_ITEM_CODE_MISSING');
});

test('item without any GTIN has no WMS code', () => {
  assert.throws(() => resolveWmsItemCode({ code: 'KIT-1', barcodes: ['X-1'] }), (e) => e.error === 'WMS_ITEM_CODE_MISSING');
  assert.throws(() => resolveWmsItemCode({}), (e) => e.error === 'WMS_ITEM_CODE_MISSING');
});

test('package unit becomes an upper-case Turkish WMS unit, default ADET', () => {
  assert.equal(resolveWmsUnit('Kutu'), 'KUTU');
  assert.equal(resolveWmsUnit('koli'), 'KOLİ');
  assert.equal(resolveWmsUnit('  paket '), 'PAKET');
  assert.equal(resolveWmsUnit(''), 'ADET');
  assert.equal(resolveWmsUnit(null), 'ADET');
});

test('builds the transfer work order the WMS team specified', () => {
  const order = buildTransferWorkOrder({
    slipNumber: 'LIMS00000007',
    description: 'REQ-123456',
    department: 'SİTOGENETİK',
    now: new Date(2026, 9, 15, 9, 5, 7),
    lines: [{ code: '8699788750973', barcodes: [], packageUnit: 'Kutu', quantity: 2, lots: [{ trackingNumber: 'LOT-A', expirationDate: '2027-03-01T00:00:00', quantity: 2 }] }]
  });
  assert.equal(order.slipType, 3);
  assert.equal(order.customSlipTypeId, 8919);
  assert.equal(order.wareHouseCode, '01.201.01');
  assert.equal(order.wareHouse2Code, '01.201.01');
  assert.equal(order.slipDate, '2026-10-15T09:05:07');
  assert.equal(order.documentNumber, 'REQ-123456');
  assert.equal(order.description1, 'REQ-123456');
  assert.equal(order.slipNumber, 'LIMS00000007');
  assert.equal('adres2Code' in order.workOrderLines[0], false, 'WMS field is adresCode2');
  assert.deepEqual(order.workOrderLines, [{
    lineNumber: 1,
    itemCode: '8699788750973',
    unitCode: 'KUTU',
    quantity: 2,
    adresCode: 'M1',
    adresCode2: '01.201.04',
    transactionDetail: [
      { ioCode: 3, adresCode: 'M1', trackingNumber: 'LOT-A', quantity: 2, expirationDate: '2027-03-01T00:00:00' },
      { ioCode: 2, adresCode: '01.201.04', trackingNumber: 'LOT-A', quantity: 2, expirationDate: '2027-03-01T00:00:00' }
    ]
  }]);
});

test('rejects empty lines and non-positive quantities', () => {
  assert.throws(() => buildTransferWorkOrder({ slipNumber: 'LIMS00000001', department: 'Numune Kabul', lines: [] }), (e) => e.error === 'WMS_NO_LINES');
  assert.throws(() => buildTransferWorkOrder({
    slipNumber: 'LIMS00000001',
    department: 'Numune Kabul',
    lines: [{ code: '8699788750973', quantity: 0, lots: [{ trackingNumber: 'L', quantity: 1 }] }]
  }), (e) => e.error === 'WMS_INVALID_QUANTITY');
});

test('reads the slip number from a flat or wrapped WMS response', () => {
  assert.equal(extractSlipNumber({ slipNumber: '261015000001' }), '261015000001');
  assert.equal(extractSlipNumber({ id: 4, workOrder: { slipNumber: '261015000002' } }), '261015000002');
  assert.equal(extractSlipNumber({ id: 4 }), null);
  assert.equal(extractSlipNumber(null), null);
});

const CATALOG_ITEMS = [
  { code: 'KRBYKDGR0000010', name: 'A3 Kağıt ', active: 1, itemUnit: [{ code: 'ADET', isMasterUnit: 1 }] },
  { code: '8699788750973', name: 'SERUM FİZYOLOJİK', active: 1, itemUnit: [{ code: 'KUTU', isMasterUnit: 1 }, { code: 'ADET' }] },
  { code: '8697637750242', name: 'ATROPIN 0,5', active: 1, itemUnit: [{ code: 'ADET', isMasterUnit: 1 }] },
  { code: '9999999999999', name: 'Pasif', active: 0, itemUnit: [] }
];
const CATALOG_STOCK = [
  { whCode: '01.201.01', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 600 },
  { whCode: '01.201.01', itemCode: '8697637750242', unitCode: 'ADET', actualStock: 123 },
  { whCode: '01.001.01', itemCode: 'KRBYKDGR0000010', unitCode: 'ADET', actualStock: 50 }
];

test('catalog lists items stocked in the Genetik warehouse first, with their stock', () => {
  const list = buildWmsCatalog({ items: CATALOG_ITEMS, stock: CATALOG_STOCK, limit: 5 });
  assert.deepEqual(list.map((e) => e.code), ['8699788750973', '8697637750242', 'KRBYKDGR0000010']);
  assert.equal(list[0].stockQty, 600);
  assert.equal(list[0].stockUnit, 'KUTU');
  assert.deepEqual(list[0].units, ['KUTU', 'ADET']);
  assert.equal(list[2].stockQty, 0, 'stock in another warehouse does not count');
  assert.equal(list[2].hasStock, false);
});

test('catalog honours the limit and skips inactive items', () => {
  const list = buildWmsCatalog({ items: CATALOG_ITEMS, stock: CATALOG_STOCK, limit: 2 });
  assert.equal(list.length, 2);
  assert.equal(buildWmsCatalog({ items: CATALOG_ITEMS, stock: [], limit: 10 }).some((e) => e.code === '9999999999999'), false);
});

test('own slip numbers use a LIMS + 8 digit series, apart from the WMS yyMMdd series', () => {
  assert.equal(formatOwnSlipNumber(1), 'LIMS00000001');
  assert.equal(formatOwnSlipNumber(123), 'LIMS00000123');
  assert.equal(formatOwnSlipNumber(1).length, 12);
  assert.throws(() => formatOwnSlipNumber(0), (e) => e.error === 'WMS_SLIP_NUMBER_INVALID');
  assert.throws(() => formatOwnSlipNumber('x'), (e) => e.error === 'WMS_SLIP_NUMBER_INVALID');
});

test('a work order cannot be built without a slip number', () => {
  assert.throws(() => buildTransferWorkOrder({
    department: 'Numune Kabul',
    lines: [{ code: '8699788750973', quantity: 1 }]
  }), (e) => e.error === 'WMS_SLIP_NUMBER_MISSING');
});

const STOCK = [
  { whCode: '01.201.01', address: 'M1', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 5, trackingNumber: 'LOT-LATE', expirationDate: '2028-01-01T00:00:00' },
  { whCode: '01.201.01', address: 'M1', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 3, trackingNumber: 'LOT-EARLY', expirationDate: '2027-01-01T00:00:00' },
  { whCode: '01.201.01', address: 'M1', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 9, trackingNumber: 'LOT-NOEXP', expirationDate: null },
  { whCode: '01.001.01', address: 'M1', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 999, trackingNumber: 'LOT-OTHER-WH', expirationDate: null },
  { whCode: '01.201.01', address: 'M1', itemCode: '8699788750973', unitCode: 'ADET', actualStock: 50, trackingNumber: 'LOT-OTHER-UNIT', expirationDate: null }
];
const alloc = (quantity, stock = STOCK) => allocateLots({ stock, itemCode: '8699788750973', unitCode: 'KUTU', quantity });

test('lots are taken earliest expiry first, no-expiry last, from the source warehouse and unit only', () => {
  assert.deepEqual(alloc(2).map((l) => [l.trackingNumber, l.quantity]), [['LOT-EARLY', 2]]);
  assert.deepEqual(alloc(10).map((l) => [l.trackingNumber, l.quantity]), [['LOT-EARLY', 3], ['LOT-LATE', 5], ['LOT-NOEXP', 2]]);
});

test('a request larger than the WMS stock is refused with the available quantity', () => {
  assert.throws(() => alloc(18), (e) => e.error === 'WMS_INSUFFICIENT_STOCK' && /mevcut 17/.test(e.message));
  assert.throws(() => alloc(1, []), (e) => e.error === 'WMS_INSUFFICIENT_STOCK');
});

test('stock without a lot number cannot be transferred', () => {
  const noLot = [{ whCode: '01.201.01', address: 'M1', itemCode: '8699788750973', unitCode: 'KUTU', actualStock: 5, trackingNumber: null, expirationDate: null }];
  const lots = alloc(2, noLot);
  assert.throws(() => buildTransferWorkOrder({
    slipNumber: 'LIMS00000001', department: 'Numune Kabul',
    lines: [{ code: '8699788750973', quantity: 2, lots }]
  }), (e) => e.error === 'WMS_LOT_REQUIRED');
});

test('a request split over several lots gets an out/in pair for each lot', () => {
  const order = buildTransferWorkOrder({
    slipNumber: 'LIMS00000001', department: 'Moleküler Genetik',
    lines: [{ code: '8699788750973', packageUnit: 'Kutu', quantity: 5, lots: alloc(5) }]
  });
  const detail = order.workOrderLines[0].transactionDetail;
  assert.deepEqual(detail.map((d) => [d.ioCode, d.trackingNumber, d.quantity, d.adresCode]), [
    [3, 'LOT-EARLY', 3, 'M1'], [2, 'LOT-EARLY', 3, '01.201.02'],
    [3, 'LOT-LATE', 2, 'M1'], [2, 'LOT-LATE', 2, '01.201.02']
  ]);
  assert.equal(order.workOrderLines[0].quantity, 5);
});

test('stocked items missing from the (50-item) WMS item list still appear, built from the stock rows', () => {
  const list = buildWmsCatalog({
    items: [{ code: 'KRBYKDGR0000010', name: 'A3 Kağıt ', active: 1, itemUnit: [{ code: 'ADET', isMasterUnit: 1 }] }],
    stock: [{ whCode: '01.201.01', itemCode: '8699788750973', itemName: 'SERUM FİZYOLOJİK ', unitCode: 'KUTU', actualStock: 600 }],
    limit: 5
  });
  assert.deepEqual(list.map((e) => [e.code, e.name, e.stockQty, e.stockUnit]), [
    ['8699788750973', 'SERUM FİZYOLOJİK', 600, 'KUTU'],
    ['KRBYKDGR0000010', 'A3 Kağıt', 0, 'ADET']
  ]);
  assert.deepEqual(list[0].units, ['KUTU']);
});

test('a zero-stock row does not count as stocked', () => {
  const list = buildWmsCatalog({
    items: [],
    stock: [{ whCode: '01.201.01', itemCode: '8699788750973', itemName: 'SERUM', unitCode: 'KUTU', actualStock: 0 }]
  });
  assert.deepEqual(list, []);
});
