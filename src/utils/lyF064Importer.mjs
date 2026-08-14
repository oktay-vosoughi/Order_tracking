const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const pad2 = (value) => String(value).padStart(2, '0');

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const expandYear = (year) => {
  const number = Number(year);
  return number < 100 ? 2000 + number : number;
};

function isoDate(year, month = 12, day = null) {
  const y = expandYear(year);
  const m = Number(month);
  const d = day === null ? daysInMonth(y, m) : Number(day);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseLyF064Date(value) {
  const text = normalizeText(value).replace(/^\./, '');
  let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (match) return isoDate(match[3], match[2], match[1]);

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    // The source form mixes Turkish dotted dates with US-style slash dates.
    return isoDate(match[3], match[1], match[2]);
  }

  match = text.match(/^(\d{1,2})\.(\d{4})$/);
  if (match) return isoDate(match[2], match[1]);

  match = text.match(/^(\d{4})$/);
  if (match) return isoDate(match[1]);
  return null;
}

function allocateQuantities(entries, totalStock) {
  if (!entries.length) return entries;
  const total = Math.max(0, Math.round(Number(totalStock) || 0));
  const weights = entries.map((entry) => entry.quantity == null ? 1 : Math.max(0, entry.quantity));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || entries.length;
  const exact = weights.map((weight) => total * weight / weightTotal);
  const allocated = exact.map(Math.floor);
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);
  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder > 0) {
        allocated[index] += 1;
        remainder -= 1;
      }
    });
  return entries.map((entry, index) => ({ ...entry, quantity: allocated[index] }));
}

export function parseLyF064Lots(value, totalStock) {
  const original = normalizeText(value);
  if (!original || /^yok$/i.test(original)) {
    return [{ expiryDate: '', quantity: Math.max(0, Math.round(Number(totalStock) || 0)), marker: 'NOEXP' }];
  }

  const normalized = original.replace(/[×]/g, 'X');
  const entries = [];
  const tokenPattern = /(YOK|\.?\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\.\d{4}|\d{4})(?:\s*\(([-+]?\d+)\))?\s*(?:X\s*(\d+))?(?:\s*\(([-+]?\d+)\))?/gi;
  let match;
  while ((match = tokenPattern.exec(normalized)) !== null) {
    const rawDate = match[1];
    let quantity = match[3] ? Number(match[3]) : null;
    const temperature = match[2] || match[4] || '';
    const expiryDate = /^yok$/i.test(rawDate) ? '' : parseLyF064Date(rawDate);
    if (expiryDate === null) continue;

    // In values such as 2020X2025 or 1.10.2026X2030, the value after X is
    // another expiry year, not a quantity. The form has no counts for these
    // LOTs, so their quantities are allocated evenly from Depo below.
    if (quantity >= 1900 && quantity <= 2200) {
      entries.push({ expiryDate, quantity: null, marker: temperature ? `T${temperature}` : '' });
      entries.push({ expiryDate: isoDate(quantity), quantity: null, marker: '' });
    } else {
      entries.push({
        expiryDate,
        quantity,
        marker: /^yok$/i.test(rawDate) ? 'NOEXP' : (temperature ? `T${temperature}` : '')
      });
    }
  }

  if (!entries.length) {
    return [{ expiryDate: '', quantity: Math.max(0, Math.round(Number(totalStock) || 0)), marker: 'NOEXP' }];
  }
  return allocateQuantities(entries, totalStock);
}

const slug = (value) => normalizeText(value)
  .normalize('NFKD')
  .replace(/[^A-Za-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toUpperCase();

function uniqueCode(rawCode, name) {
  const code = normalizeText(rawCode);
  if (code === '333675') {
    const embedded = normalizeText(name).match(/\b(CPHS-[A-Z0-9-]+)/i);
    if (embedded) return embedded[1].toUpperCase();
  }
  // The form uses YOK in place of a catalog number for more than one material.
  // Item codes are unique in the database, so keep those materials separate.
  if (code.toLocaleUpperCase('tr-TR') === 'YOK') return `YOK-${slug(name)}`;
  return code || 'CHANGEME';
}

export function isLyF064Sheet(rows) {
  return rows.some((row) => (
    normalizeText(row?.[0]).toLocaleUpperCase('tr-TR') === 'SIRA NO' &&
    normalizeText(row?.[1]).toLocaleUpperCase('tr-TR').includes('KATOLOG NUMARASI') &&
    normalizeText(row?.[4]).toLocaleUpperCase('tr-TR') === 'DEPO'
  ));
}

export function buildLyF064Rows(rows, sheetName = '') {
  const headerIndex = rows.findIndex((row) => normalizeText(row?.[0]).toLocaleUpperCase('tr-TR') === 'SIRA NO');
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((header) => normalizeText(header).toLocaleUpperCase('tr-TR'));
  const departmentIndex = headers.findIndex((header) => header === 'DEPARTMENT' || header === 'DEPARTMAN');
  const result = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const source = rows[index] || [];
    const name = normalizeText(source[2]);
    if (!name) continue;
    const code = uniqueCode(source[1], name);
    const totalStock = Math.max(0, Math.round(Number(String(source[4] ?? '').replace(',', '.')) || 0));
    const lots = parseLyF064Lots(source[7], totalStock);
    const occurrence = new Map();

    lots.forEach((lot) => {
      const baseMarker = lot.expiryDate || 'NOEXP';
      const duplicateKey = `${baseMarker}-${lot.marker || ''}`;
      const ordinal = (occurrence.get(duplicateKey) || 0) + 1;
      occurrence.set(duplicateKey, ordinal);
      const marker = [
        baseMarker,
        lot.marker && lot.marker !== baseMarker ? lot.marker : '',
        ordinal > 1 ? ordinal : ''
      ].filter(Boolean).join('-');
      result.push({
        code,
        name,
        department: departmentIndex >= 0 ? normalizeText(source[departmentIndex]) : '',
        brand: normalizeText(source[3]),
        unit: normalizeText(source[5]) || 'adet',
        initialStock: lot.quantity,
        storageLocation: normalizeText(source[6]),
        expiryDate: lot.expiryDate,
        receivedDate: parseLyF064Date(sheetName) || '',
        minStock: source[8],
        ideal_stock: source[9],
        max_stock: source[10],
        lotNumber: `LYF064-${slug(code)}-${marker}`
      });
    });
  }
  return result;
}
