import test from 'node:test';
import assert from 'node:assert/strict';

import { applyImportDepartment, toSafeDate } from './lotExcelImporter.js';

test('normalizes month-year Excel text to the first day of the month', () => {
  assert.equal(toSafeDate('11.2026'), '2026-11-01');
  assert.equal(toSafeDate('2/2027'), '2027-02-01');
  assert.equal(toSafeDate('09-2026'), '2026-09-01');
  assert.equal(toSafeDate('13.2026'), '13.2026');
});

test('fills only missing import departments from the explicit upload selection', () => {
  assert.deepEqual(applyImportDepartment([
    { code: 'A', department: '' },
    { code: 'B', department: 'SİTOGENETİK' }
  ], 'Moleküler Mikro'), [
    { code: 'A', department: 'Moleküler Mikro' },
    { code: 'B', department: 'SİTOGENETİK' }
  ]);
  assert.throws(
    () => applyImportDepartment([{ code: 'A', department: '' }], ''),
    /hedef departmanı seçin/
  );
});
