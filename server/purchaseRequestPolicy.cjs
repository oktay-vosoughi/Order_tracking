'use strict';

function assertOwnPendingCepRequest(purchase, user) {
  const isOwnRequest = purchase.requestedBy === user.username || purchase.requestedFor === user.username;
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

module.exports = { assertOwnPendingCepRequest };
