// GS1-128 / GS1 DataMatrix element-string parser (AI 01 GTIN, 10 lot, 17 expiry).
// Dependency-free. Keep in sync with src/gs1.js (ESM copy bundled by Vite).

const GS = String.fromCharCode(29); // FNC1 group separator as delivered by scanners

// Fixed-length AIs (AI → data length). Needed to walk past fields we don't use.
const FIXED_AI = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2
};

// Variable-length AIs we recognize (terminated by GS or end of string).
const VARIABLE_AI = new Set(['10', '21', '22', '30', '37']);

function expiryFromYYMMDD(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  let dd = parseInt(yymmdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return null;
  const year = yy <= 50 ? 2000 + yy : 1900 + yy; // GS1 general spec century rule
  if (dd === 0) dd = new Date(year, mm, 0).getDate(); // day 00 = last day of month
  if (dd < 1 || dd > new Date(year, mm, 0).getDate()) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

function applyAi(result, ai, value) {
  if (ai === '01' || ai === '02') result.gtin = value;
  else if (ai === '10') result.lotNumber = value;
  else if (ai === '17') result.expiryDate = expiryFromYYMMDD(value);
}

function parseGs1(input) {
  const result = { raw: typeof input === 'string' ? input.trim() : '', isGs1: false, gtin: null, lotNumber: null, expiryDate: null };
  if (!result.raw) return result;

  let s = result.raw;

  // AIM symbology identifiers: ]C1 GS1-128, ]d2 GS1 DataMatrix, ]Q3 GS1 QR, ]e0 GS1 DataBar
  const aim = s.match(/^\](C1|d2|Q3|e0)/);
  let aimSeen = false;
  if (aim) {
    s = s.slice(3);
    aimSeen = true;
  }

  // GS1 DataMatrix/QR symbols carry a leading FNC1 that scanners (e.g. ZXing)
  // emit as GS (0x1D). It is the GS1 mode signal, so strip any leading
  // separators and treat the payload as GS1 — otherwise the plausible-AI guard
  // below rejects the string because it starts with 0x1D instead of an AI.
  if (s.charCodeAt(0) === 29) {
    s = s.replace(/^\x1d+/, '');
    aimSeen = true;
  }

  // Human-readable form: (01)04012345678901(17)261231(10)ABC123
  // Anchored to string start so vendor codes containing "(NN)" don't false-positive.
  if (/^\(\d{2,4}\)/.test(s)) {
    const pairs = [...s.matchAll(/\((\d{2,4})\)([^(]*)/g)];
    if (pairs.length) {
      result.isGs1 = true;
      for (const [, ai, value] of pairs) applyAi(result, ai, value.trim());
      return result;
    }
  }

  // Raw element strings must start with a plausible AI unless an AIM prefix proved GS1.
  if (!aimSeen && !/^(00|01|02)\d{14}/.test(s)) return result;

  let i = 0;
  let parsedAny = false;
  while (i < s.length) {
    if (s[i] === GS) { i += 1; continue; }
    const ai = s.slice(i, i + 2);
    if (FIXED_AI[ai] !== undefined) {
      const len = FIXED_AI[ai];
      if (i + 2 + len > s.length) break; // truncated field — stop
      applyAi(result, ai, s.slice(i + 2, i + 2 + len));
      i += 2 + len;
      parsedAny = true;
    } else if (VARIABLE_AI.has(ai)) {
      const gsIdx = s.indexOf(GS, i + 2);
      const end = gsIdx === -1 ? s.length : gsIdx;
      applyAi(result, ai, s.slice(i + 2, end));
      i = end;
      parsedAny = true;
    } else {
      break; // unknown AI — keep what we already parsed
    }
  }
  if (parsedAny) result.isGs1 = true;
  return result;
}

// Candidate keys for DB lookup: the raw code, the GTIN-14, and its 13-digit EAN form.
function lookupKeys(parsed) {
  const keys = new Set();
  if (parsed.raw) keys.add(parsed.raw);
  if (parsed.gtin) {
    keys.add(parsed.gtin);
    if (parsed.gtin.length === 14 && parsed.gtin.startsWith('0')) keys.add(parsed.gtin.slice(1));
  }
  return [...keys];
}

// What the learning flow should persist: GTIN for GS1 (lot/expiry vary per box), raw otherwise.
function storageKey(parsed) {
  return parsed.isGs1 && parsed.gtin ? parsed.gtin : parsed.raw;
}

module.exports = { parseGs1, lookupKeys, storageKey, expiryFromYYMMDD, GS };
