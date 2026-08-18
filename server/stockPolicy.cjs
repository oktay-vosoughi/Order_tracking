'use strict';

function assertReturnLot(lot, itemId) {
  if (!lot || String(lot.itemId) !== String(itemId)) {
    throw {
      status: 404,
      error: 'LOT_NOT_FOUND',
      message: 'LOT bulunamadı veya seçilen malzemeye ait değil.'
    };
  }
}

function assertConsumableLot(lot) {
  if (!lot || !['ACTIVE', 'EXPIRED'].includes(lot.status)) {
    throw {
      status: 409,
      error: 'LOT_NOT_CONSUMABLE',
      message: 'Bu LOT tüketim için uygun durumda değil.'
    };
  }
}

module.exports = { assertReturnLot, assertConsumableLot };
