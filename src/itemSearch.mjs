function normalizeSearchValue(value) {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function getSearchCandidates(search) {
  const raw = String(search ?? '').trim();
  const candidates = new Set([normalizeSearchValue(raw)]);
  let gs1 = raw.replace(/^\](C1|d2|Q3|e0)/i, '').replace(/^\x1d+/, '');
  const gtinMatch = gs1.match(/^\(01\)(\d{14})/) || gs1.match(/^01(\d{14})/);
  if (gtinMatch) {
    candidates.add(normalizeSearchValue(gtinMatch[1]));
    if (gtinMatch[1].startsWith('0')) {
      candidates.add(normalizeSearchValue(gtinMatch[1].slice(1)));
    }
  }
  return [...candidates].filter(Boolean);
}

function matchesItemSearch(item, search, identifiers = item?.barcodes) {
  const queries = getSearchCandidates(search);
  if (!queries.length) return true;

  const itemFields = [item?.name, item?.code, item?.catalogNo];
  const identifierValues = (identifiers || []).map((identifier) => (
    typeof identifier === 'string' ? identifier : identifier?.barcode
  ));

  return [...itemFields, ...identifierValues]
    .some((value) => queries.some((query) => normalizeSearchValue(value).includes(query)));
}

export { getSearchCandidates, matchesItemSearch, normalizeSearchValue };
