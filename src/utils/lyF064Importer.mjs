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
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const text = normalizeText(value).replace(/^\./, '');
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isoDate(iso[1], iso[2], iso[3]);
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

export function parseLyF064Lots(value, totalStock) {
  const fallbackQuantity = totalStock === '' || totalStock == null ? 1 : Number(String(totalStock).replace(',', '.'));
  if (!Number.isFinite(fallbackQuantity) || fallbackQuantity < 0) throw new Error('Depo miktarı geçersiz.');
  if (value instanceof Date) {
    const expiryDate = parseLyF064Date(value);
    if (!expiryDate) throw new Error(`Geçersiz SKT: ${value.toISOString().slice(0, 10)}`);
    return [{ expiryDate, quantity: fallbackQuantity, marker: '' }];
  }
  const original = normalizeText(value);
  if (!original || /^yok$/i.test(original)) {
    return [{ expiryDate: '', quantity: fallbackQuantity, marker: 'NOEXP' }];
  }

  const normalized = original.replace(/[×]/g, 'X');
  const entries = [];
  let splitAcrossYears = false;
  const tokenPattern = /(YOK|\.?\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\.\d{4}|\d{4})(?:\s*\(([-+]?\d+)\))?\s*(?:X\s*(\d+))?(?:\s*\(([-+]?\d+)\))?/gi;
  let match;
  while ((match = tokenPattern.exec(normalized)) !== null) {
    const rawDate = match[1];
    let quantity = match[3] ? Number(match[3]) : null;
    const temperature = match[2] || match[4] || '';
    const expiryDate = /^yok$/i.test(rawDate) ? '' : parseLyF064Date(rawDate);
    if (expiryDate === null) throw new Error(`Geçersiz SKT: ${rawDate}`);

    // In this count form X followed by a year separates two expiry dates.
    // The user explicitly assigns equal shares of Depo stock to those dates.
    if (quantity >= 1900 && quantity <= 2200) {
      splitAcrossYears = true;
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
    throw new Error(`SKT okunamadı: ${original}`);
  }
  const remainder = normalized.replace(tokenPattern, '').replace(/[\s;,]+/g, '');
  if (remainder) throw new Error(`SKT ifadesi okunamadı: ${original}`);
  if (splitAcrossYears) {
    const unspecified = entries.filter((entry) => entry.quantity === null).length;
    const explicitTotal = entries.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0);
    const remaining = Math.round((fallbackQuantity - explicitTotal) * 100);
    if (remaining < 0) throw new Error('LOT miktarları Depo miktarını aşıyor.');
    const share = Math.floor(remaining / unspecified);
    let extra = remaining % unspecified;
    return entries.map((entry) => ({
      ...entry,
      quantity: entry.quantity ?? ((share + (extra-- > 0 ? 1 : 0)) / 100)
    }));
  }
  return entries.map((entry) => ({ ...entry, quantity: entry.quantity ?? (entries.length === 1 ? fallbackQuantity : 1) }));
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
  return code || `KODSUZ-${slug(name)}`;
}

export function isLyF064Sheet(rows) {
  return rows.some((row) => (
    normalizeText(row?.[0]).toLocaleUpperCase('tr-TR') === 'SIRA NO' &&
    /KAT[AO]LOG NUMARASI/.test(normalizeText(row?.[1]).toLocaleUpperCase('tr-TR')) &&
    normalizeText(row?.[4]).toLocaleUpperCase('tr-TR') === 'DEPO'
  ));
}

export function buildLyF064Rows(rows, sheetName = '') {
  const headerIndex = rows.findIndex((row) => normalizeText(row?.[0]).toLocaleUpperCase('tr-TR') === 'SIRA NO');
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((header) => normalizeText(header).toLocaleUpperCase('tr-TR'));
  const departmentIndex = headers.findIndex((header) => header === 'DEPARTMENT' || header === 'DEPARTMAN');
  const result = [];
  const errors = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const source = rows[index] || [];
    const name = normalizeText(source[2]);
    if (!name || !/^\d+$/.test(normalizeText(source[0]))) continue;
    const code = uniqueCode(source[1], name);
    const totalStock = source[4];
    let lots;
    try {
      lots = parseLyF064Lots(source[7], totalStock);
    } catch (error) {
      errors.push(`${sheetName}, sıra ${source[0]} (${code}): ${error.message}`);
      continue;
    }
    const occurrence = new Map();

    lots.forEach((lot) => {
      const temperature = /^T/.test(lot.marker) ? `${lot.marker.slice(1)} °C` : '';
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
        catalogNo: normalizeText(source[1]),
        name,
        department: departmentIndex >= 0 ? normalizeText(source[departmentIndex]) : '',
        brand: normalizeText(source[3]),
        unit: normalizeText(source[5]) || 'adet',
        initialStock: lot.quantity,
        storageLocation: normalizeText(source[6]),
        lotLocation: temperature,
        lotStorageLocation: [normalizeText(source[6]), temperature].filter(Boolean).join(' / '),
        notes: `LY-F064 sıra: ${source[0]}; SKT kaynağı: ${source[7] instanceof Date ? source[7].toISOString().slice(0, 10) : normalizeText(source[7])}; Depo: ${normalizeText(totalStock)}`,
        expiryDate: lot.expiryDate,
        receivedDate: parseLyF064Date(sheetName) || '',
        minStock: source[8],
        ideal_stock: source[9],
        max_stock: source[10],
        lotNumber: `LYF064-${slug(code)}-${marker}`
      });
    });
  }
  if (errors.length) throw new Error(`Excel içe aktarılmadı. Şu satırları düzeltin:\n${errors.join('\n')}`);
  return result;
}
