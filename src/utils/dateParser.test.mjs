import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeExpiryDate } from './dateParser.js';

test('normalizes month-year expiry values to the first day', () => {
  assert.equal(normalizeExpiryDate('11.2026'), '2026-11-01');
  assert.equal(normalizeExpiryDate('2/2027'), '2027-02-01');
  assert.equal(normalizeExpiryDate('09-2026'), '2026-09-01');
  assert.equal(normalizeExpiryDate('13.2026'), null);
});
