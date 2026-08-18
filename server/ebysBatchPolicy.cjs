'use strict';

function assertApprovableEbysBatch(rows) {
  if (!rows.length) {
    throw { status: 404, error: 'BATCH_NOT_FOUND', message: 'EBYS paketi bulunamadı.' };
  }
  if (rows.some((row) => row.status !== 'TALEP_EDILDI')) {
    throw {
      status: 409,
      error: 'INVALID_BATCH_STATUS',
      message: 'Paket yalnızca tüm kalemler EBYS beklemedeyken onaylanabilir.'
    };
  }
}

function resolveEbysExportBatchId(rows, createId) {
  if (!rows.length) {
    throw { status: 404, error: 'NO_REQUESTS', message: 'Bu filtrede EBYS bekleyen talep yok.' };
  }
  const existing = [...new Set(rows.map((row) => row.ebysBatchId).filter(Boolean))];
  const hasUnbatched = rows.some((row) => !row.ebysBatchId);
  if (existing.length > 1 || (existing.length === 1 && hasUnbatched)) {
    throw {
      status: 409,
      error: 'MIXED_BATCHES',
      message: 'Bu filtrede daha önce farklı EBYS paketlerine alınmış talepler var. Daha dar tarih/departman seçin.'
    };
  }
  return { batchId: existing[0] || createId(), isNew: existing.length === 0 };
}

module.exports = { assertApprovableEbysBatch, resolveEbysExportBatchId };
