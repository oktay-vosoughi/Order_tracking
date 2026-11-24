'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, parseTalepNo, statusFor } = require('./ebysHistoryBackfill.cjs');

const itemDefs = [
  { id: 'i1', code: '601002', name: '15 mL tube', department: 'Moleküler Genetik' },
  { id: 'i2', code: 'S33102', name: 'SYBR Safe', department: 'Moleküler Genetik' },
];
const row = (over) => ({
  talepNo: '260210-145103', code: '601002', name: '15 ml tube', requested: 1, receivedQty: 1,
  receivedDate: '2026-03-02', expiry: '2028-10-01', lot: 'L1', supplier: 'Techlabs', receivedBy: 'MŞ', ...over,
});
const pdfs = [{ talepNo: '260210-145103', items: [
  { name: '15 mL tube (paketinde 50 adet), 601002', unit: 'Paket', qty: '3' },
  { name: 'SYBR Safe DNA Gel Stain, S33102', unit: 'Kutu', qty: '2' },
] }];

test('parseTalepNo derives request date and time', () => {
  assert.deepEqual(parseTalepNo('260210-145103'), { date: '2026-02-10', dateTime: '2026-02-10 14:51:03' });
  assert.equal(parseTalepNo('yok'), null);
});

test('status follows received vs requested', () => {
  assert.equal(statusFor(3, 0), 'SIPARIS_VERILDI');
  assert.equal(statusFor(3, 2), 'KISMI_TESLIM');
  assert.equal(statusFor(3, 3), 'TESLIM_ALINDI');
});

test('sums one-row-per-unit Excel rows and keeps lots', () => {
  const rows = [row(), row(), row({ lot: 'L2', receivedDate: '2026-03-01' })];
  const [talep] = buildPlan({ pdfs, excelRows: rows, itemDefs, existingRefs: [] });
  const [tube, sybr] = talep.lines;
  assert.equal(tube.receivedQty, 3);
  assert.equal(tube.status, 'TESLIM_ALINDI');
  assert.equal(tube.lotNo, 'L1 / L2');
  assert.equal(tube.receivedDate, '2026-03-01');
  assert.equal(sybr.status, 'SIPARIS_VERILDI');
  assert.deepEqual(sybr.warnings, ['EXCELDE_YOK']);
});

test('partial receipt and unknown item are flagged', () => {
  const [talep] = buildPlan({
    pdfs: [{ talepNo: '260210-145103', items: [{ name: 'Bilinmeyen kit, XYZ1', unit: 'Kutu', qty: '2' }, pdfs[0].items[0]] }],
    excelRows: [row()],
    itemDefs,
  existingRefs: [],
  });
  assert.deepEqual(talep.lines[0].warnings, ['KALEM_TANIMI_YOK', 'EXCELDE_YOK']);
  assert.equal(talep.lines[1].status, 'KISMI_TESLIM');
});

test('already imported Talep No is skipped', () => {
  const [talep] = buildPlan({ pdfs, excelRows: [], itemDefs, existingRefs: ['260210-145103'] });
  assert.equal(talep.skipped, 'ZATEN_VAR');
});

test('multi-part kit counts only complete sets and merges part lots', () => {
  const defs = [{ id: 'a', code: '820-00020', name: 'AVITI Kit', department: 'Moleküler Genetik' }];
  const mk = (code, name, n, lot) => Array.from({ length: n }, () => row({ talepNo: '260325-180115', code, name, lot, receivedQty: 1 }));
  const rows = [...mk('820-00020', 'AVITI Kit', 8, 'K1'), ...mk('810-00003', 'Flow Cell', 8, 'F1'), ...mk('820-00004', 'Buffer', 6, 'B1'), ...mk('820-00002', 'Bottle', 8, 'T1')];
  const [talep] = buildPlan({ pdfs: [{ talepNo: '260325-180115', items: [{ name: 'AVITI Kit, 820-00020', unit: 'Adet', qty: '8' }] }], excelRows: rows, itemDefs: defs, existingRefs: [] });
  const [line] = talep.lines;
  assert.equal(line.receivedQty, 6);
  assert.equal(line.status, 'KISMI_TESLIM');
  assert.ok(line.warnings.includes('PARCA_EKSIK'));
  assert.match(line.lotNo, /K1 \| 810-00003: F1/);
  assert.deepEqual(talep.excelOnly, []);
});

test('BEDELSIZ rows load as received without a Talep No', () => {
  const [talep] = buildPlan({
    pdfs: [], itemDefs, existingRefs: [],
    excelRows: [row({ talepNo: 'BEDELSIZ', code: '601002', receivedQty: 3 })],
  });
  assert.equal(talep.noBatch, true);
  assert.equal(talep.lines[0].status, 'TESLIM_ALINDI');
  assert.equal(talep.lines[0].requestedQty, 3);
});
