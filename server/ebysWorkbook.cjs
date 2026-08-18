'use strict';

const JSZip = require('jszip');

const MAX_REQUEST_LINES = 343;
const SHEET_PATH = 'xl/worksheets/sheet1.xml';

const pad2 = (value) => String(value).padStart(2, '0');

function buildMedipolTalepNo(date = new Date(), timeZone = 'Europe/Istanbul') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}-${pad2(parts.hour)}${pad2(parts.minute)}${pad2(parts.second)}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replaceCell(xml, reference, value, { numeric = false, required = false } = {}) {
  const pattern = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)\\s*/>|<c\\b([^>]*\\br="${reference}"[^>]*)>(?:.|\\n|\\r)*?<\\/c>`);
  const match = xml.match(pattern);
  if (!match) {
    if (required) throw { status: 500, error: 'INVALID_EBYS_TEMPLATE', message: `Talep Form!${reference} bulunamadı.` };
    return xml;
  }
  let attributes = (match[1] || match[2] || '').replace(/\s+t="[^"]*"/g, '');
  const content = numeric
    ? `<v>${Number(value) || 0}</v>`
    : `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`;
  if (!numeric) attributes += ' t="inlineStr"';
  return xml.replace(pattern, `<c${attributes}>${content}</c>`);
}

function requestFullCalculation(workbookXml) {
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*)\/?>(?:<\/calcPr>)?/, (_match, attributes) => {
      const cleaned = attributes
        .replace(/\s*\/\s*$/, '')
        .replace(/\s+fullCalcOnLoad="[^"]*"/g, '')
        .replace(/\s+forceFullCalc="[^"]*"/g, '')
        .replace(/\s+calcMode="[^"]*"/g, '');
      return `<calcPr${cleaned} fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>`;
    });
  }
  return workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/></workbook>');
}

async function populateMedipolWorkbook(templateBuffer, { talepNo, rows }) {
  if (!Array.isArray(rows) || rows.length > MAX_REQUEST_LINES) {
    throw { status: 400, error: 'TOO_MANY_REQUEST_LINES', message: `En fazla ${MAX_REQUEST_LINES} kalem aktarılabilir.` };
  }
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetFile = zip.file(SHEET_PATH);
  const workbookFile = zip.file('xl/workbook.xml');
  if (!sheetFile || !workbookFile || !zip.file('xl/vbaProject.bin')) {
    throw { status: 500, error: 'INVALID_EBYS_TEMPLATE', message: 'Resmi makrolu talep formu yapısı eksik.' };
  }

  let sheetXml = await sheetFile.async('string');
  sheetXml = replaceCell(sheetXml, 'G2', talepNo, { required: true });
  sheetXml = replaceCell(sheetXml, 'K2', talepNo, { required: true });

  for (let index = 0; index < MAX_REQUEST_LINES; index += 1) {
    const rowNumber = 20 + index;
    const row = rows[index] || {};
    sheetXml = replaceCell(sheetXml, `B${rowNumber}`, row.kategori || 'Genel Ürün');
    sheetXml = replaceCell(sheetXml, `C${rowNumber}`, row.Urun || '');
    sheetXml = replaceCell(sheetXml, `H${rowNumber}`, row.birim || '');
    sheetXml = replaceCell(sheetXml, `I${rowNumber}`, row.miktar || 0, { numeric: true });
  }

  const workbookXml = requestFullCalculation(await workbookFile.async('string'));
  zip.file(SHEET_PATH, sheetXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.remove('xl/calcChain.xml');

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12'
  });
}

module.exports = { MAX_REQUEST_LINES, buildMedipolTalepNo, populateMedipolWorkbook };
