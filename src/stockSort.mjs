import { getCepDepoDisplay, getStockDisplayTarget, isBelowStockTarget } from './stockDisplay.mjs';

export const STOCK_SORT_COLUMNS = [
  ['code', 'Kod'], ['name', 'Malzeme'], ['stock', 'Depo'],
  ['target', 'İdeal Stok'], ['cep', 'CEP DEPO (Tüm Kullanıcılar)'],
  ['expiry', 'SKT'], ['status', 'Durum']
];

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
const valueFor = (item, key) => {
  switch (key) {
    case 'stock': return Number(item.totalStock ?? item.currentStock ?? 0);
    case 'target': return getStockDisplayTarget(item);
    case 'cep': return getCepDepoDisplay(item).quantity;
    case 'expiry': return item.nearestExpiry ? new Date(item.nearestExpiry).getTime() : null;
    case 'status': return ['SATIN_AL', 'STOK_YOK'].includes(item.stockStatus) || item.status === 'SATINAL' || isBelowStockTarget(item) ? 'SATIN AL' : 'YETERLİ';
    default: return item[key];
  }
};

export function sortStockItems(items, { key, direction }) {
  if (!key) return items;
  const sign = direction === 'desc' ? -1 : 1;
  const empty = (value) => value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
  return [...items].sort((a, b) => {
    const left = valueFor(a, key), right = valueFor(b, key);
    if (empty(left) || empty(right)) return Number(empty(left)) - Number(empty(right));
    return sign * (typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left), String(right)));
  });
}
