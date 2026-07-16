// server/mgTrackingForm.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTrackingRows,
  buildDistributionRows,
  statusLabel,
  TRACKING_HEADERS,
  DIST_HEADERS,
} = require('./mgTrackingForm.cjs');

test('tracking headers end with Onay + Durum', () => {
  assert.equal(TRACKING_HEADERS.length, 13);
  assert.equal(TRACKING_HEADERS[0], 'Talep Numarası');
  assert.equal(TRACKING_HEADERS[11], 'Onay');
  assert.equal(TRACKING_HEADERS[12], 'Durum');
});

test('statusLabel maps Turkish enums to readable labels, passes through unknown', () => {
  assert.equal(statusLabel('TALEP_EDILDI'), 'Talep Edildi');
  assert.equal(statusLabel('ONAYLANDI'), 'Onaylandı');
  assert.equal(statusLabel('TESLIM_ALINDI'), 'Teslim Alındı');
  assert.equal(statusLabel('SOMETHING_NEW'), 'SOMETHING_NEW');
  assert.equal(statusLabel(null), '');
});

test('buildTrackingRows maps a received talep to columns A..M incl Durum', () => {
  const rows = buildTrackingRows([
    {
      requestNumber: 'REQ-1',
      itemCode: '951054',
      itemName: 'EZ1 Kit',
      requestedQty: 1,
      requestedAt: '2026-01-09',
      receivedDate: '2026-02-05',
      receivedQtyTotal: 1,
      expiryDate: '2026-06-22',
      lotNo: 'L1',
      supplierName: 'Monogenx',
      receivedBy: 'Mehtap',
      approvedBy: 'Nilgun',
      status: 'TESLIM_ALINDI',
    },
  ]);
  assert.deepEqual(rows[0], [
    'REQ-1', '951054', 'EZ1 Kit', 1, '09.01.2026', '05.02.2026', 1, '22.06.2026',
    'L1', 'Monogenx', 'Mehtap', 'Nilgun', 'Teslim Alındı',
  ]);
});

test('buildTrackingRows shows a request-only talep with blank receipt cols and its status', () => {
  const rows = buildTrackingRows([
    {
      requestNumber: 'REQ-2',
      itemCode: 'ABC',
      itemName: 'Item',
      requestedQty: 3,
      requestedAt: '2026-03-01',
      receivedDate: null,
      receivedQtyTotal: null,
      expiryDate: null,
      lotNo: null,
      supplierName: '',
      receivedBy: null,
      approvedBy: null,
      status: 'TALEP_EDILDI',
    },
  ]);
  assert.deepEqual(rows[0], [
    'REQ-2', 'ABC', 'Item', 3, '01.03.2026', '', '', '', '', '', '', '', 'Talep Edildi',
  ]);
});

test('buildDistributionRows maps a CEP DEPO dağıt event to columns A..I', () => {
  const rows = buildDistributionRows([
    {
      distributedAt: '2026-02-10',
      itemCode: '951054',
      itemName: 'EZ1 Kit',
      packQty: 2,
      unit: 'kutu',
      distributedBy: 'admin',
      recipient: 'serdal',
      requestNumber: 'REQ-1',
      notes: 'rutin',
    },
  ]);
  assert.deepEqual(rows[0], [
    '10.02.2026', '951054', 'EZ1 Kit', 2, 'kutu', 'admin', 'serdal', 'REQ-1', 'rutin',
  ]);
});

test('build*Rows return no rows for empty/undefined input', () => {
  assert.deepEqual(buildTrackingRows([]), []);
  assert.deepEqual(buildTrackingRows(undefined), []);
  assert.deepEqual(buildDistributionRows([]), []);
});
