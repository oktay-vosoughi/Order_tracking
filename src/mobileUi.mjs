export const PURCHASE_STATUS_FILTERS = {
  pending: {
    label: 'EBYS bekleme',
    statuses: ['TALEP_EDILDI'],
    accent: 'text-yellow-600'
  },
  approved: {
    label: 'Onaylı',
    statuses: ['ONAYLANDI'],
    accent: 'text-blue-600'
  },
  ordered: {
    label: 'Siparişte',
    statuses: ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'],
    accent: 'text-purple-600'
  },
  completed: {
    label: 'Tamamlanan',
    statuses: ['TESLIM_ALINDI', 'GELDI'],
    accent: 'text-green-600'
  },
  rejected: {
    label: 'Reddedildi',
    statuses: ['REDDEDILDI'],
    accent: 'text-red-600'
  }
};

const PURCHASE_STATUS_BADGES = {
  TALEP_EDILDI: {
    label: 'EBYS bekleme',
    className: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  ONAYLANDI: {
    label: 'Onaylandı',
    className: 'bg-blue-50 text-blue-800 border-blue-200'
  },
  SIPARIS_VERILDI: {
    label: 'Sipariş Verildi',
    className: 'bg-purple-50 text-purple-800 border-purple-200'
  },
  KISMI_TESLIM: {
    label: 'Kısmen Geldi',
    className: 'bg-orange-50 text-orange-800 border-orange-200'
  },
  KISMEN_GELDI: {
    label: 'Kısmen Geldi',
    className: 'bg-orange-50 text-orange-800 border-orange-200'
  },
  TESLIM_ALINDI: {
    label: 'Tamamlandı',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200'
  },
  GELDI: {
    label: 'Tamamlandı',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200'
  },
  REDDEDILDI: {
    label: 'Reddedildi',
    className: 'bg-rose-50 text-rose-800 border-rose-200'
  }
};

export function getPurchaseStatusBadge(status) {
  return PURCHASE_STATUS_BADGES[status] || {
    label: status || 'Bilinmiyor',
    className: 'bg-gray-50 text-gray-700 border-gray-200'
  };
}

export function getPurchaseStatusFilterOptions(counts = {}) {
  return [
    { value: '', label: 'Tüm talepler' },
    ...Object.entries(PURCHASE_STATUS_FILTERS).map(([value, config]) => ({
      value,
      label: `${config.label} (${counts[value] || 0})`
    }))
  ];
}

export function getReadyForOrderCount(purchases = []) {
  if (!Array.isArray(purchases)) return 0;
  return purchases.filter((purchase) => purchase?.status === 'ONAYLANDI').length;
}

export function getPurchaseTaskCounts(purchases = []) {
  if (!Array.isArray(purchases)) {
    return { ebysPrepare: 0, ebysApproval: 0, receiving: 0, completed: 0 };
  }

  const counts = purchases.reduce((result, purchase) => {
    if (purchase?.status === 'TALEP_EDILDI' && !purchase?.ebysBatchId) result.ebysPrepare += 1;
    if (['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(purchase?.status)) result.receiving += 1;
    if (['TESLIM_ALINDI', 'GELDI'].includes(purchase?.status)) result.completed += 1;
    return result;
  }, { ebysPrepare: 0, ebysApproval: 0, receiving: 0, completed: 0 });

  counts.ebysApproval = new Set(
    purchases
      .filter((purchase) => purchase?.status === 'TALEP_EDILDI' && purchase?.ebysBatchId)
      .map((purchase) => String(purchase.ebysBatchId))
  ).size;

  return counts;
}

export function matchesPurchaseQuickView(purchase, quickView = 'all') {
  if (!purchase || quickView === 'all') return true;
  if (quickView === 'ebys_prepare') return purchase.status === 'TALEP_EDILDI' && !purchase.ebysBatchId;
  if (quickView === 'ebys_approval') return purchase.status === 'TALEP_EDILDI' && !!purchase.ebysBatchId;
  if (quickView === 'receiving') return ['SIPARIS_VERILDI', 'KISMI_TESLIM', 'KISMEN_GELDI'].includes(purchase.status);
  if (quickView === 'completed') return ['TESLIM_ALINDI', 'GELDI'].includes(purchase.status);
  return true;
}

export function groupPurchasesByEbysBatch(purchases = []) {
  if (!Array.isArray(purchases)) return [];

  const groups = [];
  const groupIndexes = new Map();

  purchases.forEach((purchase, purchaseIndex) => {
    const batchId = String(purchase?.ebysBatchId || '').trim();
    const key = batchId ? `batch:${batchId}` : `purchase:${purchase?.id ?? purchaseIndex}`;
    const existingIndex = groupIndexes.get(key);

    if (existingIndex !== undefined) {
      groups[existingIndex].purchases.push(purchase);
      return;
    }

    groupIndexes.set(key, groups.length);
    groups.push({ key, batchId: batchId || null, purchases: [purchase] });
  });

  return groups;
}

export function getLotPreview(lots = [], limit = 3) {
  if (!Array.isArray(lots)) return [];
  return lots.slice(0, Math.max(0, limit));
}

export function getHiddenLotCount(lots = [], limit = 3) {
  if (!Array.isArray(lots)) return 0;
  return Math.max(0, lots.length - Math.max(0, limit));
}

export function getVisibleTabOptions({
  canViewStock,
  canViewTalep,
  canViewSiparis,
  canViewDagit,
  isObserver,
  canManageUsers,
  hasCurrentUser,
  requestLabel = 'Talepler',
  orderLabel = 'Siparişler',
  prioritizeDistribution = false,
  pendingRequestCount = 0,
  readyForOrderCount = 0,
  wasteCount = 0
}) {
  const options = [];

  if (canViewStock) {
    options.push({ value: 'stock', label: 'Stok' });
  }

  if (canViewDagit && prioritizeDistribution) {
    options.push({ value: 'distributions', label: 'Dağıtım' });
  }

  if (canViewTalep) {
    options.push({ value: 'requests', label: `${requestLabel} (${pendingRequestCount})` });
  }

  if (canViewSiparis) {
    options.push({ value: 'orders', label: `${orderLabel} (${readyForOrderCount})` });
  }

  if (canViewDagit && !prioritizeDistribution) {
    options.push({ value: 'distributions', label: 'Dağıtım' });
  }

  if (!isObserver) {
    options.push({ value: 'waste', label: `Atık (${wasteCount})` });
  }

  if (canViewStock) {
    options.push({ value: 'total_stock', label: 'Genel Stok Görünümü' });
  }

  if (!isObserver) {
    options.push({ value: 'lot_inventory', label: 'LOT Stok Yönetimi' });
  }

  options.push({ value: 'cep_depo', label: 'CEP DEPO' });

  if (canManageUsers) {
    options.push({ value: 'users', label: 'Kullanıcılar' });
  }

  if (hasCurrentUser) {
    options.push({ value: 'account', label: 'Hesabım' });
  }

  return options;
}
