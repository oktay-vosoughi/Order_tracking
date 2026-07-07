const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGs1, lookupKeys, storageKey } = require('./gs1');

const GS = String.fromCharCode(29);

test('GS1-128 with AIM prefix: GTIN + expiry + lot', () => {
  const r = parseGs1(']C1' + '01' + '04012345678901' + '17' + '261231' + '10' + 'ABC123');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.expiryDate, '2026-12-31');
  assert.equal(r.lotNumber, 'ABC123');
});

test('variable-length lot terminated by GS separator, expiry day 00 = last day of month', () => {
  const r = parseGs1('01' + '04012345678901' + '10' + 'LOT42' + GS + '17' + '270600');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.lotNumber, 'LOT42');
  assert.equal(r.expiryDate, '2027-06-30');
});

test('human-readable parenthesized form', () => {
  const r = parseGs1('(01)04012345678901(17)261231(10)ABC/123');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.expiryDate, '2026-12-31');
  assert.equal(r.lotNumber, 'ABC/123');
});

test('GS1 DataMatrix AIM prefix ]d2', () => {
  const r = parseGs1(']d2' + '01' + '08699123456789' + '10' + 'P-88');
  assert.equal(r.isGs1, true);
  assert.equal(r.gtin, '08699123456789');
  assert.equal(r.lotNumber, 'P-88');
  assert.equal(r.expiryDate, null);
});

test('plain EAN-13 is not GS1 — raw fallback', () => {
  const r = parseGs1('8690123456789');
  assert.equal(r.isGs1, false);
  assert.equal(r.gtin, null);
  assert.equal(r.lotNumber, null);
  assert.equal(r.raw, '8690123456789');
});

test('13-digit code starting with 01 does not false-positive as GS1', () => {
  // AI 01 needs 14 data digits; only 11 remain → must fall back to raw
  const r = parseGs1('0123456789012');
  assert.equal(r.isGs1, false);
  assert.equal(r.gtin, null);
});

test('arbitrary vendor code is raw fallback', () => {
  const r = parseGs1('KAT-2024-XYZ');
  assert.equal(r.isGs1, false);
  assert.equal(r.raw, 'KAT-2024-XYZ');
});

test('unknown AI stops parsing but keeps earlier fields', () => {
  const r = parseGs1('01' + '04012345678901' + '99' + 'whatever');
  assert.equal(r.gtin, '04012345678901');
  assert.equal(r.isGs1, true);
});

test('invalid expiry month yields null expiry', () => {
  const r = parseGs1('01' + '04012345678901' + '17' + '261331');
  assert.equal(r.expiryDate, null);
});

test('lookupKeys: GTIN-14 with leading zero also offers 13-digit EAN form', () => {
  const keys = lookupKeys(parseGs1('01' + '08690123456789' + '10' + 'L1'));
  assert.ok(keys.includes('08690123456789'));
  assert.ok(keys.includes('8690123456789'));
});

test('lookupKeys for plain code is the raw string', () => {
  const keys = lookupKeys(parseGs1('KAT-2024-XYZ'));
  assert.deepEqual(keys, ['KAT-2024-XYZ']);
});

test('storageKey: GTIN for GS1 scans (lot varies per shipment), raw otherwise', () => {
  assert.equal(storageKey(parseGs1('01' + '08690123456789' + '10' + 'L1')), '08690123456789');
  assert.equal(storageKey(parseGs1('8690123456789')), '8690123456789');
});
