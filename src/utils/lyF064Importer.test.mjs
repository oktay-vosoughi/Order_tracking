import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLyF064Rows, parseLyF064Lots } from './lyF064Importer.mjs';

test('treats YOKX1 as one no-expiry LOT', () => {
  assert.deepEqual(parseLyF064Lots('YOKX1', 1), [
    { expiryDate: '', quantity: 1, marker: 'NOEXP' }
  ]);
});

test('divides Depo equally across X-separated expiry years without rounding away stock', () => {
  assert.deepEqual(parseLyF064Lots('2020X2025', 11), [
    { expiryDate: '2020-12-31', quantity: 5.5, marker: '' },
    { expiryDate: '2025-12-31', quantity: 5.5, marker: '' }
  ]);
  assert.deepEqual(parseLyF064Lots('1.10.2026X2030', 28), [
    { expiryDate: '2026-10-01', quantity: 14, marker: '' },
    { expiryDate: '2030-12-31', quantity: 14, marker: '' }
  ]);
});

test('uses embedded CPHS identifiers and stable material-specific blank codes', () => {
  const header = ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', ' Depo'];
  const rows = buildLyF064Rows([
    header,
    [1, '333675', 'CPHS-59658Z-66 QIAseq Panel', 'Qiagen', 2, 'Kutu', 'Dolap', '6/6/27', 0, 0, 0],
    [2, '', 'El Dezenfektanı', 'Aqua', 1, 'Adet', 'Raf', 'YOKX1', 0, 0, 0]
  ], '06.08.2026');

  assert.equal(rows[0].code, 'CPHS-59658Z-66');
  assert.equal(rows[0].receivedDate, '2026-08-06');
  assert.equal(rows[0].catalogNo, '333675');
  assert.equal(rows[1].code, 'KODSUZ-EL-DEZENFEKTAN');
});

test('keeps separate materials whose catalog number is YOK', () => {
  const header = ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', ' Depo'];
  const rows = buildLyF064Rows([
    header,
    [1, 'YOK', 'Midi Plate', '', 8, 'Paket', 'Raf', 'Yok', 1, 1, 2],
    [2, 'YOK', 'Tube box for 50 ml', '', 14, 'Adet', 'Raf', 'Yok', 1, 1, 2]
  ], '06.08.2026');

  assert.notEqual(rows[0].code, rows[1].code);
});

test('reads Department dynamically from the LY-F064 header', () => {
  const header = ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', ' Depo', 'Birim', 'Buzdolabı/Dolap', 'Son Kullanma Tarihi', 'Kritik', 'İdeal', 'Maks', 'Durum', 'Department'];
  const rows = buildLyF064Rows([
    header,
    [1, '605001', 'Microcentrifuge tube', 'Nest', 11, 'Kutu', 'Raf', 'Yok', 1, 2, 3, 'YETERLİ', 'Moleküler Genetik']
  ], '06.08.2026');

  assert.equal(rows[0].department, 'Moleküler Genetik');
});

test('preserves explicit quantities even when Depo disagrees', () => {
  assert.deepEqual(parseLyF064Lots('8.12.2026X1 24.12.2026X2', 99).map(({ expiryDate, quantity }) => ({ expiryDate, quantity })), [
    { expiryDate: '2026-12-08', quantity: 1 },
    { expiryDate: '2026-12-24', quantity: 2 }
  ]);
  assert.deepEqual(parseLyF064Lots('03.07.2027X6 (-20) 03.07.2027X6 (+4)', 6).map((lot) => lot.quantity), [6, 6]);
});

test('reads real Excel dates without timezone shifts or year-only truncation', () => {
  assert.equal(parseLyF064Lots(new Date('2027-07-01T00:00:00Z'), 2)[0].expiryDate, '2027-07-01');
  assert.throws(() => parseLyF064Lots(new Date('2927-02-27T00:00:00Z'), 1), /Geçersiz SKT/);
  assert.throws(() => parseLyF064Lots('31.02.2027X1', 1), /Geçersiz SKT/);
  assert.throws(() => parseLyF064Lots('bilinmeyen', 1), /okunamadı/);
  assert.throws(() => parseLyF064Lots('01.03.2027X1 belirsiz', 1), /okunamadı/);
});

test('keeps zero stock and uses one only when no quantity is supplied', () => {
  assert.equal(parseLyF064Lots('Yok', 0)[0].quantity, 0);
  assert.equal(parseLyF064Lots('', undefined)[0].quantity, 1);
  assert.equal(parseLyF064Lots('Yok', 11)[0].quantity, 11);
  assert.equal(parseLyF064Lots('10.2027 11.2027', 9)[0].quantity, 1);
});

test('same upload produces the same lot identifiers and skips footer rows', () => {
  const matrix = [
    ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', 'Depo'],
    [1, 'A1', 'Malzeme', '', 3, 'Kutu', 'Dolap', '8.12.2026X1 24.12.2026X2'],
    ['', '', 'Form onayı']
  ];
  const first = buildLyF064Rows(matrix, '15.09.2026');
  assert.equal(first.length, 2);
  assert.deepEqual(buildLyF064Rows(matrix, '15.09.2026'), first);
  assert.notEqual(first[0].lotNumber, first[1].lotNumber);
});

test('imports the QIAxcel row as 1200 RxN with the exact expiry and stock thresholds', () => {
  const header = ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', 'Depo', 'Birim', 'Buzdolabı/Dolap', 'Son Kullanma Tarihi', 'Kritik', 'İdeal', 'Maks', 'Durum', 'Departman'];
  for (const date of ['15.01.2027', new Date('2027-01-15T00:00:00Z')]) {
    const [row] = buildLyF064Rows([header, [38, 929002, 'QIAxcel DNA High Resolution Kit (1200)', 'QIAGEN', 1200, 'RxN', 'Depo Oda Isısı /Koridor4', date, 5, 15, 120, 'YETERLİ', 'Moleküler Genetik']]);
    assert.equal(row.code, '929002');
    assert.equal(row.catalogNo, '929002');
    assert.equal(row.initialStock, 1200);
    assert.equal(row.unit, 'RxN');
    assert.equal(row.expiryDate, '2027-01-15');
    assert.equal(row.minStock, 5);
    assert.equal(row.ideal_stock, 15);
    assert.equal(row.max_stock, 120);
  }
});

test('keeps the temperature on each separate lot, before or after X quantities', () => {
  for (const date of ['3.6.2027X1 (-20) 4.6.2027X1 (+4)', '3.6.2027(-20)X1 4.6.2027(+4)X1']) {
    const rows = buildLyF064Rows([
      ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', 'Depo'],
      [1, 'KIT', 'Panel', 'QIAGEN', 2, 'Kutu', 'Koridor4', date]
    ]);
    assert.deepEqual(rows.map((r) => [r.expiryDate, r.initialStock, r.unit, r.lotLocation, r.lotStorageLocation]), [
      ['2027-06-03', 1, 'Kutu', '-20 °C', 'Koridor4 / -20 °C'],
      ['2027-06-04', 1, 'Kutu', '+4 °C', 'Koridor4 / +4 °C']
    ]);
    assert.notEqual(rows[0].lotNumber, rows[1].lotNumber);
  }
});
