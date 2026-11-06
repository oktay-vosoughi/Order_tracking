export const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const getStockDisplayTarget = (item) => {
  const ideal = toNumber(item?.ideal_stock, NaN);
  if (Number.isFinite(ideal)) return ideal;
  return toNumber(item?.minStock, 0);
};

export const isBelowStockTarget = (item) => {
  const totalStock = toNumber(item?.totalStock ?? item?.currentStock, 0);
  const target = getStockDisplayTarget(item);
  return target > 0 && totalStock < target;
};

// Label for the catch-all pool used by lots/purchases that predate
// department-scoped tracking (no department recorded on the row).
export const UNASSIGNED_POOL_LABEL = 'Etiketlenmemiş';

export const getStockDepartments = (item) => [...new Set([
  item?.department,
  ...(Array.isArray(item?.departments) ? item.departments : []),
  ...Object.keys(item?.pools || {}).filter((department) => department !== 'UNASSIGNED')
].filter(Boolean))];

export const matchesStockDepartment = (item, department) =>
  !department || Number(item?.isGlobal) === 1 || getStockDepartments(item).includes(department);

// Each department works like its own lab with its own stock and its own
// buying process (see server/depoGroup.cjs). `item.pools` is a map keyed by
// department name (or 'UNASSIGNED') — this only returns rows when the item's
// stock/pending orders are actually split across more than one department, so
// ordinary single-department items render exactly as before this feature existed.
export const getDepoPoolRows = (item) => {
  const pools = item?.pools;
  if (!pools || typeof pools !== 'object') return [];
  const keys = Object.keys(pools);
  if (keys.length < 2) return [];
  return keys
    .map((key) => ({
      key,
      label: key === 'UNASSIGNED' ? UNASSIGNED_POOL_LABEL : key,
      // Show the full on-hand quantity per department (expired lots included);
      // expiry is flagged separately by the SKT alert system.
      available: toNumber(pools[key]?.total ?? pools[key]?.available, 0),
      pendingOrderQty: toNumber(pools[key]?.pendingOrderQty, 0),
      pendingDetails: Array.isArray(pools[key]?.pendingDetails) ? pools[key].pendingDetails : [],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
};

// When a department filter is active and the item's stock is split across
// departments, show that department's own quantity as the headline number.
// The pooled total (shared pools, e.g. MG + Mikro) is returned separately.
export const getDepartmentStockView = (item, department, totalStock) => {
  const rows = getDepoPoolRows(item);
  const own = department ? rows.find((row) => row.key === department) : null;
  if (!own) return { total: totalStock, rows, pooledTotal: null };
  return { total: own.available, rows: [own], pooledTotal: totalStock };
};

const PENDING_STATUS_LABELS = {
  ONAYLANDI: 'Onaylandı',
  SIPARIS_VERILDI: 'Sipariş verildi',
  KISMI_TESLIM: 'Kısmen geldi',
};

// Hover text for a "+N beklemede" label: one line per request the quantity comes from.
export const formatPendingTooltip = (details) => {
  if (!Array.isArray(details) || details.length === 0) return '';
  const lines = details.map((d) => {
    const status = PENDING_STATUS_LABELS[d.status] || d.status;
    const partial = toNumber(d.receivedQty, 0) > 0 ? ` (${toNumber(d.orderedQty, 0)}'den ${toNumber(d.receivedQty, 0)} geldi)` : '';
    const date = d.requestedAt ? new Date(d.requestedAt).toLocaleDateString('tr-TR') : '';
    return `${d.talepNo} · ${status} · ${toNumber(d.pendingQty, 0)} bekliyor${partial}${date ? ` · ${date}` : ''}`;
  });
  return ['Bekleyen talepler:', ...lines].join('\n');
};

export const getCepDepoDisplay = (item) => {
  const hasSubUnit = Boolean(
    item?.consumptionUnit &&
    (String(item?.consumptionUnitType || '').toUpperCase() !== 'PACK' ||
      toNumber(item?.unitsPerPackage, 0) > 1)
  );

  return {
    quantity: hasSubUnit
      ? toNumber(item?.cepDepoUnitTotal, 0)
      : toNumber(item?.cepDepoTotal, 0),
    unit: hasSubUnit
      ? item.consumptionUnit
      : (item?.packageUnit || item?.unit || 'birim'),
    hasSubUnit
  };
};
