import test from 'node:test';
import assert from 'node:assert/strict';

import { DEPARTMENTS } from './labDepartments.mjs';

test('exports the active laboratory department options', () => {
  assert.deepEqual(Object.values(DEPARTMENTS), [
    'Cytogenetic',
    'Molecular Micro',
    'Molecular Genetic',
    'Numune Kabul',
    'Diğer'
  ]);
});
