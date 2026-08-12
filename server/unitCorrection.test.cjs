const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnitCorrectionValues,
  resolveCepCorrectionTarget
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
    storageLocation: null,
    minReactionThreshold: null,
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

test('uses an existing ZERO balance as the correction target', () => {
  const zeroBalance = { id: 'balance-1', department: 'Moleküler Genetik', status: 'ZERO' };

  assert.deepEqual(resolveCepCorrectionTarget([zeroBalance], null), {
    department: 'Moleküler Genetik',
    balance: zeroBalance
  });
});

test('selects the requested department from multiple CEP balances', () => {
  const balances = [
    { id: 'balance-1', department: 'Moleküler Genetik', status: 'ACTIVE' },
    { id: 'balance-2', department: 'SİTOGENETİK', status: 'ZERO' }
  ];

  assert.deepEqual(resolveCepCorrectionTarget(balances, 'SİTOGENETİK'), {
    department: 'SİTOGENETİK',
    balance: balances[1]
  });
});

test('returns a new department target when no balance exists yet', () => {
  assert.deepEqual(resolveCepCorrectionTarget([], 'Numune Kabul'), {
    department: 'Numune Kabul',
    balance: null
  });
});

test('requires a department when an item has multiple CEP balances', () => {
  assert.throws(
    () => resolveCepCorrectionTarget([
      { id: 'balance-1', department: 'Moleküler Genetik' },
      { id: 'balance-2', department: 'SİTOGENETİK' }
    ], null),
    (error) => error.code === 'CEP_DEPARTMENT_REQUIRED'
  );
});
