const normalizeText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const toNullableNumber = (value, fieldName) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return number;
};

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

const buildUnitCorrectionValues = (input = {}) => {
  const unit = normalizeText(input.unit) || 'kutu';
  const packageUnit = normalizeText(input.packageUnit) || unit;
  const consumptionUnit = normalizeText(input.consumptionUnit);
  const consumptionUnitType = normalizeText(input.consumptionUnitType || 'PACK').toUpperCase();
  const unitsPerPackage = toNullableNumber(input.unitsPerPackage, 'unitsPerPackage');
  const mainStock = toNullableNumber(input.mainStock, 'mainStock');
  const idealStock = toNullableNumber(input.idealStock, 'idealStock');
  const maxStock = toNullableNumber(input.maxStock, 'maxStock');
  const cepUnitQty = toNullableNumber(input.cepUnitQty, 'cepUnitQty');

  if (!['PACK', 'UNIT', 'TEST'].includes(consumptionUnitType)) {
    throw new Error('consumptionUnitType must be PACK, UNIT, or TEST');
  }

  if (consumptionUnitType !== 'PACK') {
    if (!consumptionUnit) throw new Error('consumptionUnit is required for UNIT or TEST corrections');
    if (!(unitsPerPackage > 0)) throw new Error('unitsPerPackage must be positive for UNIT or TEST corrections');
    if (!Number.isInteger(unitsPerPackage)) throw new Error('unitsPerPackage must be an integer');
  }

  return {
    unit,
    packageUnit,
    consumptionUnit,
    unitsPerPackage,
    consumptionUnitType,
    mainStock,
    idealStock,
    maxStock,
    cepUnitQty,
    cepPackQty: consumptionUnitType === 'PACK'
      ? cepUnitQty
      : (cepUnitQty == null ? null : roundQuantity(cepUnitQty / unitsPerPackage))
  };
};

module.exports = {
  buildUnitCorrectionValues
};
