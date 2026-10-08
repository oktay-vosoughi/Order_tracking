// server/sharedStockPool.cjs
// Departments that draw from ONE physical stock. Lots keep their own
// `department` value (nothing is migrated); every membership, visibility,
// FEFO and lot/recipient check treats the departments of a group as equal.
// All other departments stay fully separate (depo_pool_split unchanged).
// Mirrored for the UI in src/sharedStockPool.mjs — keep the two in sync.

const SHARED_STOCK_POOLS = [['Moleküler Genetik', 'Moleküler Mikro']];

// All departments sharing stock with `department` (itself included).
function poolMembers(department) {
  const group = SHARED_STOCK_POOLS.find((members) => members.includes(department));
  return group ? [...group] : [department];
}

function samePool(a, b) {
  return Boolean(a) && Boolean(b) && poolMembers(a).includes(b);
}

function expandDepartments(departments) {
  return [...new Set((departments || []).flatMap(poolMembers))];
}

module.exports = { SHARED_STOCK_POOLS, poolMembers, samePool, expandDepartments };
