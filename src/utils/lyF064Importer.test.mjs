import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLyF064Rows, parseLyF064Lots } from './lyF064Importer.mjs';

test('treats YOKX1 as one no-expiry LOT', () => {
  assert.deepEqual(parseLyF064Lots('YOKX1', 1), [
    { expiryDate: '', quantity: 1, marker: 'NOEXP' }
  ]);
});

test('splits two expiry years across Depo stock', () => {
  assert.deepEqual(parseLyF064Lots('2020X2025', 11), [
    { expiryDate: '2020-12-31', quantity: 6, marker: '' },
    { expiryDate: '2025-12-31', quantity: 5, marker: '' }
  ]);
  assert.deepEqual(parseLyF064Lots('1.10.2026X2030', 30), [
    { expiryDate: '2026-10-01', quantity: 15, marker: '' },
    { expiryDate: '2030-12-31', quantity: 15, marker: '' }
  ]);
});

test('uses embedded CPHS catalog identifiers and CHANGEME for blank codes', () => {
  const header = ['Sıra No', 'Katolog Numarası', 'Malzeme Adı', 'Marka', ' Depo'];
  const rows = buildLyF064Rows([
    header,
    [1, '333675', 'CPHS-59658Z-66 QIAseq Panel', 'Qiagen', 2, 'Kutu', 'Dolap', '6/6/27', 0, 0, 0],
    [2, '', 'El Dezenfektanı', 'Aqua', 1, 'Adet', 'Raf', 'YOKX1', 0, 0, 0]
  ], '06.08.2026');

  assert.equal(rows[0].code, 'CPHS-59658Z-66');
  assert.equal(rows[0].receivedDate, '2026-08-06');
  assert.equal(rows[1].code, 'CHANGEME');
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
