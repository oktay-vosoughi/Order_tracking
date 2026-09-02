import test from 'node:test';
import assert from 'node:assert/strict';
import { findScannedDistributionLot } from './distributionLotMatch.mjs';

const lots = [
  { id: 'lot-1', lotNumber: 'ABC-123', expiryDate: '2027-06-30' },
  { id: 'lot-2', lotNumber: 'DEF-456', expiryDate: '2027-06-30T00:00:00.000Z' },
  { id: 'lot-3', lotNumber: 'ABC-123', expiryDate: '2028-01-31' }
];

test('matches the unique stock lot using GS1 LOT and SKT together', () => {
  assert.equal(findScannedDistributionLot(lots, {
    lotNumber: 'abc-123',
    expiryDate: '2027-06-30'
  })?.id, 'lot-1');
});

test('matches a unique LOT when the GS1 barcode has no SKT', () => {
  assert.equal(findScannedDistributionLot(lots, { lotNumber: 'DEF-456' })?.id, 'lot-2');
});

test('does not guess when an SKT-only scan matches multiple stock lots', () => {
  assert.equal(findScannedDistributionLot(lots, { expiryDate: '2027-06-30' }), null);
});

test('does not fall back to a different expiry when LOT and SKT disagree', () => {
  assert.equal(findScannedDistributionLot(lots, {
    lotNumber: 'ABC-123',
    expiryDate: '2029-01-01'
  }), null);
});

