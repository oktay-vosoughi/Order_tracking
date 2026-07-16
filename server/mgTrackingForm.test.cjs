// server/mgTrackingForm.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMgRows, HEADERS, COL_COUNT } = require('./mgTrackingForm.cjs');

test('HEADERS has the 15 MG-F069 columns A..O', () => {
  assert.equal(COL_COUNT, 15);
  assert.equal(HEADERS[0], 'Talep Numarası');
  assert.equal(HEADERS[14], 'Onay');
});

test('buildMgRows maps a fully-populated distribution row to columns A..O', () => {
  const rows = buildMgRows([
    {
      requestNumber: '260109-M22257660',
      itemCode: '951054',
      itemName: 'EZ1-2 DNA Blood 350 ul Kit (48)',
      requestedQty: 1,
      requestedAt: '2026-01-09',
      receivedDate: '2026-02-05',
      receivedQtyTotal: 1,
      expiryDate: '2026-06-22',
      lotNo: '181035855',
      supplierName: 'Monogenx',
      receivedBy: 'Mehtap',
      distributedDate: '2026-02-10',
      distributionReceivedBy: 'serdal',
      distributionCompletedDate: '2026-02-16',
      approvedBy: 'Nilgun',
    },
  ]);

  assert.deepEqual(rows[0], [
    '260109-M22257660', '951054', 'EZ1-2 DNA Blood 350 ul Kit (48)', 1,
    '09.01.2026', '05.02.2026', 1, '22.06.2026', '181035855', 'Monogenx',
    'Mehtap', '10.02.2026', 'serdal', '16.02.2026', 'Nilgun',
  ]);
});

test('buildMgRows leaves dispatch columns (L/M/N) blank when there is no distribution', () => {
  const rows = buildMgRows([
    {
      requestNumber: 'REQ-1',
      itemCode: 'ABC',
      itemName: 'Item',
      requestedQty: 2,
      requestedAt: '2026-03-01',
      receivedDate: '2026-03-10',
      receivedQtyTotal: 2,
      expiryDate: null,
      lotNo: 'L1',
      supplierName: 'Firma',
      receivedBy: 'Mehtap',
      distributedDate: null,
      distributionReceivedBy: null,
      distributionCompletedDate: null,
      approvedBy: 'Oktay',
    },
  ]);

  // L (11), M (12), N (13) are blank; expiry (H, index 7) blank; rest filled.
  assert.deepEqual(rows[0], [
    'REQ-1', 'ABC', 'Item', 2, '01.03.2026', '10.03.2026', 2, '', 'L1', 'Firma',
    'Mehtap', '', '', '', 'Oktay',
  ]);
});

test('buildMgRows returns no rows for empty input', () => {
  assert.deepEqual(buildMgRows([]), []);
  assert.deepEqual(buildMgRows(undefined), []);
});

test('buildMgRows renders qty 0 (not blank) but null qty as blank', () => {
  const rows = buildMgRows([
    { requestNumber: 'R', requestedQty: 0, receivedQtyTotal: null },
  ]);
  assert.equal(rows[0][3], 0); // D: requestedQty 0 stays 0
  assert.equal(rows[0][6], ''); // G: null receivedQtyTotal -> blank
});
