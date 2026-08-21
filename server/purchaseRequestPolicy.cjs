'use strict';

function assertOwnPendingCepRequest(purchase, user) {
  const isOwnRequest = purchase.requestedBy === user.username;
  if (!isOwnRequest) {
    throw { status: 403, error: 'FORBIDDEN', message: 'Yalnızca kendi CEP DEPO talebinizi değiştirebilirsiniz.' };
  }

  const isCepRequest = Number(purchase.isCepDepoRequest) === 1 || Boolean(purchase.requestedFor);
  if (!isCepRequest) {
    throw { status: 400, error: 'NOT_CEP_REQUEST', message: 'Bu kayıt bir CEP DEPO talebi değildir.' };
  }

  if (purchase.status !== 'TALEP_EDILDI') {
    throw {
      status: 409,
      error: 'INVALID_STATUS',
      message: 'Yalnızca onay bekleyen talepler değiştirilebilir veya iptal edilebilir.'
    };
  }
}

function buildDepartmentPurchaseFilter(departments, alias = 'p') {
  if (departments === null) return { clause: '', params: [] };
  if (departments.length === 0) return { clause: '1 = 0', params: [] };

  const placeholders = departments.map(() => '?').join(',');
  return {
    clause: `(${alias}.department IN (${placeholders}) OR ((` +
      `${alias}.department IS NULL OR ${alias}.department = '') AND COALESCE(${alias}.requestedFor, ${alias}.requestedBy) IN (` +
      `SELECT u.username FROM users u JOIN user_departments ud ON ud.userId = u.id WHERE ud.department IN (${placeholders})` +
      ')))',
    params: [...departments, ...departments]
  };
}

module.exports = { assertOwnPendingCepRequest, buildDepartmentPurchaseFilter };
