export const READ_ONLY_AUDIT_ROLES = Object.freeze(['KALITE', 'KURUMSAL']);

export function isReadOnlyAuditRole(role) {
  return READ_ONLY_AUDIT_ROLES.includes(role);
}

