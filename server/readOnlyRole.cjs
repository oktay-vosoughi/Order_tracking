const READ_ONLY_AUDIT_ROLES = Object.freeze(['KALITE', 'KURUMSAL']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SELF_SERVICE_WRITE_PATHS = new Set(['/api/account/change-password']);

function isReadOnlyAuditRole(role) {
  return READ_ONLY_AUDIT_ROLES.includes(role);
}

function isReadOnlyWriteBlocked({ role, method, path }) {
  if (!isReadOnlyAuditRole(role)) return false;
  if (SAFE_METHODS.has(String(method || 'GET').toUpperCase())) return false;
  return !SELF_SERVICE_WRITE_PATHS.has(path);
}

module.exports = { READ_ONLY_AUDIT_ROLES, isReadOnlyAuditRole, isReadOnlyWriteBlocked };

