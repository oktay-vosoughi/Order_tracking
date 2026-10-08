// Mirror of server/sharedStockPool.cjs — keep the two in sync.
export const SHARED_STOCK_POOLS = [['Moleküler Genetik', 'Moleküler Mikro']];

export const poolMembers = (department) => {
  const group = SHARED_STOCK_POOLS.find((members) => members.includes(department));
  return group ? [...group] : [department];
};

export const samePool = (a, b) => Boolean(a) && Boolean(b) && poolMembers(a).includes(b);
