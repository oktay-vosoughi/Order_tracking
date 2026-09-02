import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCepDepoPinStorageKey,
  readCepDepoPins,
  sortCepDepoBalancesByPins,
  writeCepDepoPins
} from './cepDepoPins.mjs';

test('keeps pinned CEP DEPO materials first without changing order inside groups', () => {
  const balances = [
    { itemId: 'a', itemName: 'A' },
    { itemId: 'b', itemName: 'B' },
    { itemId: 'c', itemName: 'C' },
    { itemId: 'd', itemName: 'D' }
  ];

  assert.deepEqual(
    sortCepDepoBalancesByPins(balances, ['c', 'a']).map((row) => row.itemId),
    ['a', 'c', 'b', 'd']
  );
});

test('stores pins separately for each lab technician', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  writeCepDepoPins(storage, 'tekniker-1', ['item-2', 'item-2', 'item-4']);
  writeCepDepoPins(storage, 'tekniker-2', ['item-1']);

  assert.deepEqual(readCepDepoPins(storage, 'tekniker-1'), ['item-2', 'item-4']);
  assert.deepEqual(readCepDepoPins(storage, 'tekniker-2'), ['item-1']);
  assert.notEqual(getCepDepoPinStorageKey('tekniker-1'), getCepDepoPinStorageKey('tekniker-2'));
});

test('returns an empty pin list for corrupt browser storage', () => {
  const storage = { getItem: () => '{not-json' };
  assert.deepEqual(readCepDepoPins(storage, 'tekniker-1'), []);
});

