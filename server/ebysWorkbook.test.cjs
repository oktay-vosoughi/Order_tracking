'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { buildMedipolTalepNo, populateMedipolWorkbook } = require('./ebysWorkbook.cjs');

test('buildMedipolTalepNo matches the official YYMMDD-HHMMSS workbook format', () => {
  assert.equal(buildMedipolTalepNo(new Date('2026-08-18T06:05:46.000Z'), 'Europe/Istanbul'), '260818-090546');
});

test('populateMedipolWorkbook preserves VBA and fills request number plus product rows', async () => {
  const template = new JSZip();
  template.file('xl/vbaProject.bin', Buffer.from([1, 2, 3]));
  template.file('xl/workbook.xml', '<workbook><calcPr calcId="1"/></workbook>');
  template.file('xl/worksheets/sheet1.xml', `
    <worksheet><sheetData>
      <row r="2"><c r="G2" s="1"/><c r="K2" s="2"><f>OLD()</f><v>0</v></c></row>
      <row r="20"><c r="B20" s="3"/><c r="C20" s="4"/><c r="H20" s="5"/><c r="I20" s="6"/></row>
    </sheetData></worksheet>
  `);
  const templateBuffer = await template.generateAsync({ type: 'nodebuffer' });

  const result = await populateMedipolWorkbook(templateBuffer, {
    talepNo: '260818-090546',
    rows: [{ kategori: 'Kit', Urun: 'PCR Kit, PCR-1', birim: 'Kutu', miktar: 4 }]
  });
  const output = await JSZip.loadAsync(result);
  const sheet = await output.file('xl/worksheets/sheet1.xml').async('string');
  const workbook = await output.file('xl/workbook.xml').async('string');

  assert.deepEqual(await output.file('xl/vbaProject.bin').async('nodebuffer'), Buffer.from([1, 2, 3]));
  assert.match(sheet, /r="G2"[^>]*t="inlineStr"[^>]*>.*260818-090546/s);
  assert.match(sheet, /r="K2"[^>]*t="inlineStr"[^>]*>.*260818-090546/s);
  assert.match(sheet, /r="B20"[^>]*t="inlineStr"[^>]*>.*Kit/s);
  assert.match(sheet, /r="C20"[^>]*t="inlineStr"[^>]*>.*PCR Kit, PCR-1/s);
  assert.match(sheet, /r="I20"[^>]*><v>4<\/v>/s);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.doesNotMatch(workbook, /<calcPr[^>]*\/\s+fullCalcOnLoad/);
});

test('populateMedipolWorkbook rejects more than the official 343 line limit', async () => {
  await assert.rejects(
    () => populateMedipolWorkbook(Buffer.alloc(0), { talepNo: '1', rows: Array(344).fill({}) }),
    (error) => error.error === 'TOO_MANY_REQUEST_LINES'
  );
});
