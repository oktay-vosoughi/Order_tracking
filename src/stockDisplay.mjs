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
      available: toNumber(pools[key]?.available, 0),
      pendingOrderQty: toNumber(pools[key]?.pendingOrderQty, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
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
