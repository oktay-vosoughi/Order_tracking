// server/depoGroup.cjs
// Pure, DB-free logic for splitting main-warehouse `lots` stock into physically
// separate depo pools, one per department — each department works like its own
// lab with its own stock and its own buying process. Lots/purchases that predate
// department-scoped tracking (no department recorded) fall into the UNASSIGNED
// catch-all pool until someone explicitly tags them.

const UNASSIGNED_POOL = 'UNASSIGNED';

// departmentName: the exact department string stored on a lot/purchase row
// (e.g. 'SİTOGENETİK', 'Moleküler Genetik'), or null/'' for untagged legacy rows.
// Returns the pool key that row belongs to — every distinct department is its
// own pool; blank/null collapses to the shared UNASSIGNED pool.
function resolveDepoGroup(departmentName) {
  const trimmed = (departmentName || '').trim();
  return trimmed || UNASSIGNED_POOL;
}

// group: a pool key from resolveDepoGroup (a department name, or UNASSIGNED_POOL).
// Returns a WHERE-clause fragment + params scoping a lots query (aliased `lotAlias`)
// to that pool.
function buildLotPoolFilter(group, lotAlias = 'l') {
  if (group === UNASSIGNED_POOL) {
    return { clause: `AND (${lotAlias}.department IS NULL OR ${lotAlias}.department = '')`, params: [] };
  }
  return { clause: `AND ${lotAlias}.department = ?`, params: [group] };
}

module.exports = { UNASSIGNED_POOL, resolveDepoGroup, buildLotPoolFilter };
