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
