const PIN_STORAGE_PREFIX = 'gtmlims:cep-depo-pins:';

export function getCepDepoPinStorageKey(username) {
  return `${PIN_STORAGE_PREFIX}${String(username || '').trim()}`;
}

export function readCepDepoPins(storage, username) {
  if (!storage || !username) return [];
  try {
    const parsed = JSON.parse(storage.getItem(getCepDepoPinStorageKey(username)) || '[]');
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((itemId) => typeof itemId === 'string' && itemId.trim()))]
      : [];
  } catch {
    return [];
  }
}

export function writeCepDepoPins(storage, username, itemIds) {
  if (!storage || !username) return;
  storage.setItem(getCepDepoPinStorageKey(username), JSON.stringify([...new Set(itemIds)]));
}

export function sortCepDepoBalancesByPins(balances = [], pinnedItemIds = []) {
  const pinned = new Set(pinnedItemIds);
  return balances
    .map((balance, index) => ({ balance, index }))
    .sort((a, b) => {
      const aPinned = pinned.has(a.balance.itemId);
      const bPinned = pinned.has(b.balance.itemId);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ balance }) => balance);
}

