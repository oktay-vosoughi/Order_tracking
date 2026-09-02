import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReadyForOrderCount,
  getPurchaseTaskCounts,
  groupPurchasesByEbysBatch,
  matchesPurchaseQuickView,
  getHiddenLotCount,
  getLotPreview,
  getPurchaseStatusFilterOptions,
  getVisibleTabOptions
} from './mobileUi.mjs';

test('builds the visible mobile navigation options from user capabilities', () => {
  const options = getVisibleTabOptions({
    canViewStock: true,
    canViewTalep: true,
    canViewSiparis: true,
    canViewDagit: true,
    isObserver: false,
    canManageUsers: true,
    hasCurrentUser: true,
    pendingRequestCount: 2,
    readyForOrderCount: 4,
    wasteCount: 3
  });

  assert.deepEqual(
    options.map((option) => option.value),
    [
      'stock',
      'requests',
      'orders',
      'distributions',
      'waste',
      'total_stock',
      'lot_inventory',
      'cep_depo',
      'users',
      'account'
    ]
  );
  assert.equal(options.find((option) => option.value === 'requests').label, 'Talepler (2)');
  assert.equal(options.find((option) => option.value === 'orders').label, 'Siparişler (4)');
  assert.equal(options.find((option) => option.value === 'waste').label, 'Atık (3)');
});

test('uses role-friendly purchasing labels in mobile navigation', () => {
  const options = getVisibleTabOptions({
    canViewStock: false,
    canViewTalep: true,
    canViewSiparis: true,
    canViewDagit: true,
    isObserver: true,
    canManageUsers: false,
    hasCurrentUser: false,
    pendingRequestCount: 3,
    readyForOrderCount: 2,
    requestLabel: 'EBYS İşleri',
    orderLabel: 'Mal Kabul',
    prioritizeDistribution: true
  });

  assert.equal(options.find((option) => option.value === 'requests').label, 'EBYS İşleri (3)');
  assert.equal(options.find((option) => option.value === 'orders').label, 'Mal Kabul (2)');
  assert.deepEqual(options.slice(0, 3).map((option) => option.value), ['distributions', 'requests', 'orders']);
});

test('counts approved requests ready for logistics ordering', () => {
  assert.equal(getReadyForOrderCount([
    { id: 'p-1', status: 'ONAYLANDI' },
    { id: 'p-2', status: 'TALEP_EDILDI' },
    { id: 'p-3', status: 'SIPARIS_VERILDI' },
    { id: 'p-4', status: 'ONAYLANDI' }
  ]), 2);
});

test('counts the purchasing tasks shown to buying and logistics roles', () => {
  assert.deepEqual(getPurchaseTaskCounts([
    { status: 'TALEP_EDILDI', ebysBatchId: null },
    { status: 'TALEP_EDILDI', ebysBatchId: 'EBYS-1' },
    { status: 'TALEP_EDILDI', ebysBatchId: 'EBYS-1' },
    { status: 'SIPARIS_VERILDI', ebysBatchId: 'EBYS-1' },
    { status: 'KISMI_TESLIM', ebysBatchId: 'EBYS-2' },
    { status: 'TESLIM_ALINDI', ebysBatchId: 'EBYS-3' }
  ]), {
    ebysPrepare: 1,
    ebysApproval: 1,
    receiving: 2,
    completed: 1
  });
});

test('filters purchases for each task-first purchasing view', () => {
  const unpacked = { status: 'TALEP_EDILDI', ebysBatchId: null };
  const packed = { status: 'TALEP_EDILDI', ebysBatchId: 'EBYS-1' };
  const ordered = { status: 'SIPARIS_VERILDI', ebysBatchId: 'EBYS-1' };

  assert.equal(matchesPurchaseQuickView(unpacked, 'ebys_prepare'), true);
  assert.equal(matchesPurchaseQuickView(packed, 'ebys_prepare'), false);
  assert.equal(matchesPurchaseQuickView(packed, 'ebys_approval'), true);
  assert.equal(matchesPurchaseQuickView(ordered, 'receiving'), true);
});

test('groups purchases from the same EBYS form into one batch', () => {
  const groups = groupPurchasesByEbysBatch([
    { id: 'p-1', ebysBatchId: 'EBYS-1', itemName: 'A' },
    { id: 'p-2', ebysBatchId: 'EBYS-1', itemName: 'B' },
    { id: 'p-3', ebysBatchId: 'EBYS-2', itemName: 'C' },
    { id: 'p-4', ebysBatchId: null, itemName: 'D' }
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0], {
    key: 'batch:EBYS-1',
    batchId: 'EBYS-1',
    purchases: [
      { id: 'p-1', ebysBatchId: 'EBYS-1', itemName: 'A' },
      { id: 'p-2', ebysBatchId: 'EBYS-1', itemName: 'B' }
    ]
  });
  assert.equal(groups[2].key, 'purchase:p-4');
});

test('builds purchase status filter options including approved and rejected states', () => {
  const options = getPurchaseStatusFilterOptions({
    pending: 4,
    approved: 3,
    ordered: 2,
    completed: 1,
    rejected: 5
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ['', 'pending', 'approved', 'ordered', 'completed', 'rejected']
  );
  assert.equal(options.find((option) => option.value === 'approved').label, 'Onaylı (3)');
  assert.equal(options.find((option) => option.value === 'rejected').label, 'Reddedildi (5)');
});

test('limits lot previews for expanded mobile cards', () => {
  const lots = [
    { id: 'lot-1' },
    { id: 'lot-2' },
    { id: 'lot-3' },
    { id: 'lot-4' }
  ];

  assert.deepEqual(getLotPreview(lots, 2).map((lot) => lot.id), ['lot-1', 'lot-2']);
  assert.equal(getHiddenLotCount(lots, 2), 2);
  assert.equal(getHiddenLotCount(lots, 8), 0);
});
