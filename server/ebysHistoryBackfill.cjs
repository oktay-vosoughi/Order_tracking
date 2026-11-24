'use strict';

// Pure planning logic for the one-off EBYS history backfill
// (see updates/UPDATE_2026-10-30_ebys_history_backfill.md).
// PDF request forms give the request lines; the MG-F069 Excel says what arrived.
// Excel has ONE ROW PER UNIT: received qty = sum of "Gelen Miktar" over the rows.

const DEPARTMENT = 'Moleküler Genetik';
const MARKER = '[EBYS-GECIS]';
const ACTOR = 'GECIS_AKTARIM';

const name0 = (name) => name.split(',')[0].trim();
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9ığüşöçâî]/g, '');

const isoDate = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  if (y < 2020 || y > 2030) return null;
  return value.toISOString().slice(0, 10);
};

// "YYMMDD-HHMMSS" -> { date: 'YYYY-MM-DD', dateTime: 'YYYY-MM-DD HH:MM:SS' }
const parseTalepNo = (talepNo) => {
  const m = String(talepNo).match(/^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const date = `20${m[1]}-${m[2]}-${m[3]}`;
  return { date, dateTime: `${date} ${m[4]}:${m[5]}:${m[6]}` };
};

const textOf = (v) => {
  const s = String(v ?? '').trim();
  return /^(yok|alındı|alindi|bitti)$/i.test(s) ? '' : s;
};

// Candidate item codes from a PDF line: comma parts, parentheticals removed, plus code-like words.
const codeTokens = (name) => {
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
  const stripped = parts.map((p) => p.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  const words = name.match(/[A-Za-z0-9][A-Za-z0-9._/-]{3,}/g) || [];
  return [...new Set([...parts, ...stripped, ...words])];
};

// Item definition to create when the catalog has none: Excel code first, else a code-like PDF token.
const deriveNewItem = (pdfItem, group) => {
  const parts = pdfItem ? pdfItem.name.split(',').map((x) => x.trim()).filter(Boolean) : [];
  const codeLike = (x) => /^[A-Za-z0-9][A-Za-z0-9._/-]{3,}$/.test(x) && /\d/.test(x);
  const tokenCode = [...parts].reverse().find(codeLike) || null;
  const code = (group?.code && !/^yok$/i.test(group.code) ? group.code : tokenCode) || null;
  const baseName = pdfItem ? (code && parts.length > 1 && parts[parts.length - 1] === code ? parts.slice(0, -1).join(', ') : pdfItem.name) : group?.name;
  const name = String(baseName || '').replace(/[,\s]+$/, '').trim();
  if (!name) return null;
  return { code: (code || `GECIS-${norm(name).slice(0, 24)}`).slice(0, 100), name: name.slice(0, 255) };
};

// Multi-part kits: Excel lists each part as its own row/code, the system has ONE item.
// `per` = parts needed per kit. A kit counts as received only for as many complete sets as the parts allow.
const PART_RULES = [
  { parents: ['820-00020'], parts: [{ code: '810-00003', per: 1 }, { code: '820-00004', per: 1 }, { code: '820-00002', per: 1 }] }, // AVITI 2x150: kit + flow cell + loading buffer + buffer bottle
  { parents: ['4336917'], parts: [{ code: '4336697', per: 2 }] }, // ABI BigDye + 2 buffers
  { parents: ['180479', '180480', '180481', '180482'], parts: [{ code: '1120146', per: 1 }] }, // QIAseq UDI-x (Core + Adapter)
  { parents: ['P-HS24-48-H-HS24-48'], parts: [{ code: 'MAD-003930MU-PHS24-24 (24 TESTS)', per: 1 }, { code: 'MAD-003930M-H-HS24-24 (24 TESTS)', per: 1 }] }, // HPV Direct-Flow Chip Kit: PCR + Hybridization reagents
];

// PDF code -> code(s) the Excel uses for the same product (supplier re-versioned the SKU).
const CODE_ALIASES = { ABADE1: ['ABADE2'] };

function applyParts(lines, groups, used) {
  for (const rule of PART_RULES) {
    const parentSet = new Set(rule.parents.map(norm));
    const parentLines = lines.filter((l) => l.codes.some((c) => parentSet.has(c)));
    if (!parentLines.length) continue;
    const pools = rule.parts.map((part) => {
      const g = groups.get(norm(part.code));
      if (g) used.add(g.key);
      return { part, group: g || null, kits: g ? Math.floor(Math.round(g.received) / part.per) : 0 };
    });
    for (const line of parentLines) {
      const before = line.receivedQty;
      const complete = Math.min(before, ...pools.map((p) => p.kits));
      for (const p of pools) p.kits -= complete;
      line.receivedQty = complete;
      line.status = statusFor(line.requestedQty, complete);
      if (complete < before) line.warnings.push('PARCA_EKSIK');
      const partLots = pools.filter((p) => p.group && p.group.lots.length).map((p) => `${p.part.code}: ${p.group.lots.join(', ')}`);
      if (partLots.length) line.lotNo = [line.lotNo, ...partLots].filter(Boolean).join(' | ').slice(0, 250);
      if (!line.receivedDate && complete > 0) line.receivedDate = pools.map((p) => p.group?.receivedDates.slice().sort()[0]).filter(Boolean).sort()[0] || null;
    }
  }
}

// excelRows: [{ talepNo, code, name, requested, receivedQty, receivedDate, expiry, lot, supplier, receivedBy }]
function groupExcelRows(excelRows) {
  const byTalep = new Map();
  for (const r of excelRows) {
    const key = norm(r.code) || norm(r.name);
    if (!key) continue;
    if (!byTalep.has(r.talepNo)) byTalep.set(r.talepNo, new Map());
    const groups = byTalep.get(r.talepNo);
    if (!groups.has(key)) {
      groups.set(key, {
        key, code: String(r.code ?? '').trim(), name: r.name, requested: 0, received: 0,
        receivedDates: [], expiries: [], lots: [], supplier: '', receivedBy: '', rows: 0, ihale: false,
      });
    }
    const g = groups.get(key);
    g.rows += 1;
    if (/[iİ]hale/i.test(`${r.receivedQty} ${r.lot}`)) g.ihale = true;
    g.requested += Number(r.requested) || 0;
    const qty = Number(r.receivedQty);
    if (qty > 0) {
      g.received += qty;
      if (r.receivedDate) g.receivedDates.push(r.receivedDate);
      if (r.expiry) g.expiries.push(r.expiry);
    }
    const lot = textOf(r.lot);
    if (qty > 0 && lot && !g.lots.includes(lot)) g.lots.push(lot);
    if (!g.supplier) g.supplier = textOf(r.supplier);
    if (!g.receivedBy && qty > 0) g.receivedBy = textOf(r.receivedBy);
  }
  return byTalep;
}

const statusFor = (requested, received) => {
  if (received <= 0) return 'SIPARIS_VERILDI';
  return received >= requested ? 'TESLIM_ALINDI' : 'KISMI_TESLIM';
};

function buildLine({ pdfItem, def, group, warnings }) {
  const newItem = !def ? deriveNewItem(pdfItem, group) : null;
  // "İhale" rows carry no real receipt data (tender is handled later): keep the line pending.
  if (group?.ihale) { warnings.push('IHALE_BEKLEMEDE'); group = { ...group, received: 0, receivedDates: [], expiries: [], lots: [], receivedBy: '' }; }
  const requestedQty = pdfItem ? Math.round(Number(pdfItem.qty)) : Math.round(group.requested) || 1;
  const received = group ? Math.round(group.received) : 0;
  const sorted = (list) => [...list].sort();
  return {
    pdfName: pdfItem?.name || null,
    unit: pdfItem?.unit || null,
    item: def ? { id: def.id, code: def.code, name: def.name } : null,
    newItem,
    requestedQty,
    receivedQty: received,
    status: statusFor(requestedQty, received),
    receivedDate: group ? sorted(group.receivedDates)[0] || null : null,
    expiryDate: group ? sorted(group.expiries)[0] || null : null,
    lotNo: group && group.lots.length ? group.lots.join(' / ').slice(0, 250) : null,
    supplierName: group?.supplier || null,
    receivedBy: group?.receivedBy || null,
    warnings,
    codes: [def?.code, newItem?.code, group?.code].filter(Boolean).map(norm),
  };
}

// pdfs: [{ talepNo, date, items: [{ name, unit, qty }] }]
// itemDefs: [{ id, code, name, department }]
// overrides: { "<talepNo>|<pdf item name>": "<item code>" }
function buildPlan({ pdfs, excelRows, itemDefs, existingRefs, overrides = {}, excelOnlyTalepNos = [], department = DEPARTMENT }) {
  const byCode = new Map();
  for (const d of itemDefs) {
    const k = norm(d.code);
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k).push(d);
  }
  const pickDef = (code) => {
    const list = byCode.get(norm(code)) || [];
    return list.find((d) => d.department === department) || list[0] || null;
  };
  const byName = new Map(itemDefs.map((d) => [norm(d.name), d]));
  const excel = groupExcelRows(excelRows);
  const existing = new Set(existingRefs);
  const talepler = [];

  for (const pdf of pdfs) {
    const t = parseTalepNo(pdf.talepNo);
    if (!t) continue;
    if (existing.has(pdf.talepNo)) { talepler.push({ talepNo: pdf.talepNo, skipped: 'ZATEN_VAR' }); continue; }
    const groups = excel.get(pdf.talepNo) || new Map();
    const used = new Set();
    const lines = [];
    for (const it of pdf.items) {
      const warnings = [];
      const tokens = codeTokens(it.name);
      const override = overrides[`${pdf.talepNo}|${it.name}`];
      let def = override ? pickDef(override) : null;
      if (!def) for (const tk of tokens) { def = pickDef(tk); if (def) break; }
      if (!def) def = byName.get(norm(name0(it.name))) || null;
      if (!def) warnings.push('KALEM_TANIMI_YOK');

      const base = [...tokens, ...(def ? [def.code] : [])];
      const candidates = [...base, ...base.flatMap((c) => CODE_ALIASES[c] || [])].map(norm);
      const free = [...groups.values()].filter((g) => !used.has(g.key));
      let group = free.find((g) => candidates.includes(norm(g.code)))
        || free.find((g) => norm(g.code).length >= 5 && candidates.some((c) => c.length >= 5 && norm(g.code).includes(c)));
      if (!group) {
        const first = norm(name0(it.name));
        const pdfCode = [...tokens].reverse().find((x) => /^[A-Za-z0-9][A-Za-z0-9._/-]{3,}$/.test(x) && /\d/.test(x));
        group = free.find((g) => norm(g.name) === first || norm(g.name) === norm(it.name)
          || (first.length >= 6 && (norm(g.name).startsWith(first) || first.startsWith(norm(g.name)))
            && (!g.code || !pdfCode || norm(g.code) === norm(pdfCode) || norm(pdfCode) === first)));
      }
      if (group) used.add(group.key); else warnings.push('EXCELDE_YOK');
      if (group && group.received > 0 && !group.receivedDates.length) warnings.push('GELIS_TARIHI_GECERSIZ');
      lines.push(buildLine({ pdfItem: it, def, group, warnings }));
    }
    applyParts(lines, groups, used);
    const leftovers = [...groups.values()].filter((g) => !used.has(g.key)).map((g) => `${g.code} ${g.name}`);
    talepler.push({ talepNo: pdf.talepNo, source: 'PDF', ...t, lines, excelOnly: leftovers });
  }

  for (const talepNo of excelOnlyTalepNos) {
    const t = parseTalepNo(talepNo);
    if (!t) continue;
    if (existing.has(talepNo)) { talepler.push({ talepNo, skipped: 'ZATEN_VAR' }); continue; }
    const lines = [...(excel.get(talepNo) || new Map()).values()].map((group) => {
      const warnings = [];
      const def = pickDef(group.code) || byName.get(norm(group.name)) || null;
      if (!def) warnings.push('KALEM_TANIMI_YOK');
      if (group.received > 0 && !group.receivedDates.length) warnings.push('GELIS_TARIHI_GECERSIZ');
      return buildLine({ pdfItem: null, def, group, warnings });
    });
    talepler.push({ talepNo, source: 'EXCEL', ...t, lines, excelOnly: [] });
  }
  // "BEDELSİZ" (free of charge) rows have no Talep No / PDF: load as already received.
  const free = excel.get('BEDELSIZ');
  if (free) {
    if (existing.has('BEDELSIZ')) {
      talepler.push({ talepNo: 'BEDELSIZ', skipped: 'ZATEN_VAR' });
    } else {
      const lines = [...free.values()].filter((g) => g.received > 0).map((group) => {
        const warnings = [];
        const def = pickDef(group.code) || byName.get(norm(group.name)) || null;
        if (!def) warnings.push('KALEM_TANIMI_YOK');
        const line = buildLine({ pdfItem: null, def, group, warnings });
        line.requestedQty = Math.max(1, line.receivedQty);
        line.status = 'TESLIM_ALINDI';
        line.warnings.push('BEDELSIZ');
        return line;
      });
      const date = lines.map((l) => l.receivedDate).filter(Boolean).sort()[0] || '2026-01-01';
      talepler.push({ talepNo: 'BEDELSIZ', source: 'BEDELSIZ', noBatch: true, date, dateTime: `${date} 00:00:00`, lines, excelOnly: [] });
    }
  }
  return talepler;
}

module.exports = { PART_RULES, DEPARTMENT, MARKER, ACTOR, norm, isoDate, parseTalepNo, groupExcelRows, statusFor, buildPlan };
