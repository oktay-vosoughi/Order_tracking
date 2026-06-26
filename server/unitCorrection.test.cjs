const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnitCorrectionValues
} = require('./unitCorrection.cjs');

test('builds UNIT correction values from visible CEP DEPO sub-unit quantity', () => {
  const values = buildUnitCorrectionValues({
    unit: 'kutu',
    packageUnit: 'kutu',
    consumptionUnit: 'reax',
    unitsPerPackage: 50,
    consumptionUnitType: 'UNIT',
    mainStock: 0,
    idealStock: 1,
    maxStock: 2,
    cepUnitQty: 24
  });

  assert.deepEqual(values, {
    unit: 'kutu',
    packageUnit: 'kutu',
    consumptionUnit: 'reax',
    unitsPerPackage: 50,
    consumptionUnitType: 'UNIT',
    mainStock: 0,
    idealStock: 1,
    maxStock: 2,
    cepUnitQty: 24,
    cepPackQty: 0.48
  });
});

test('requires a positive conversion factor for UNIT corrections', () => {
  assert.throws(
    () => buildUnitCorrectionValues({
      unit: 'kutu',
      packageUnit: 'kutu',
      consumptionUnit: 'reax',
      unitsPerPackage: 0,
      consumptionUnitType: 'UNIT',
      mainStock: 0,
      idealStock: 1,
      maxStock: 2,
      cepUnitQty: 24
    }),
    /unitsPerPackage/
  );
});
