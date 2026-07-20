// server/departmentScope.cjs
// Pure, DB-free logic for department-scoped visibility filtering.
// See docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md

const DEPARTMENT_BYPASS_ROLES = ['ADMIN', 'SATINAL', 'SATINAL_LOJISTIK', 'KURUMSAL', 'KALITE'];

function isBypassRole(role) {
  return DEPARTMENT_BYPASS_ROLES.includes(role);
}

// departments: string[] (caller's memberships) or null (bypass — caller sees everything).
// Used for item_definitions-backed queries (unified-stock, lots) where a global-item
// flag also grants visibility regardless of department membership.
function buildItemDepartmentFilter(departments) {
  if (departments === null) return { clause: '', params: [] };
  if (departments.length === 0) return { clause: 'AND (id.isGlobal = 1)', params: [] };
  const placeholders = departments.map(() => '?').join(',');
  return {
    clause: `AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (${placeholders})))`,
    params: [...departments],
  };
}

// departments: string[] (must be non-empty — callers with zero departments should
// short-circuit to an empty result before calling this) or null (bypass).
// Used for CEP DEPO tables, which have no isGlobal concept — a balance/movement/
// distribution/consumption row always belongs to exactly one department.
function buildDeptInClause(departments, columnRef) {
  if (departments === null) return { clause: '', params: [] };
  if (departments.length === 0) throw new Error('buildDeptInClause requires a non-empty department list; caller must short-circuit first');
  const placeholders = departments.map(() => '?').join(',');
  return { clause: `AND ${columnRef} IN (${placeholders})`, params: [...departments] };
}

module.exports = { DEPARTMENT_BYPASS_ROLES, isBypassRole, buildItemDepartmentFilter, buildDeptInClause };
