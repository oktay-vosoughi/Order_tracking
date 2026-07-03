const normalizeLotNumber = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeExpiryDate = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const fail = (code, message) => {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
};

const validateLotSplit = (lot, splits) => {
  if (!lot || lot.status !== 'ACTIVE' || !(Number(lot.currentQuantity) > 0)) {
    fail('LOT_NOT_ACTIVE', 'LOT aktif değil veya mevcut miktarı sıfır.');
  }

  if (!Array.isArray(splits) || splits.length < 2) {
    fail('INVALID_INPUT', 'En az 2 bölüm satırı girilmelidir.');
  }

  const normalized = splits.map((split, index) => {
    const lotNumber = normalizeLotNumber(split?.lotNumber);
    const quantity = Number(split?.quantity);
    const expiryDate = normalizeExpiryDate(split?.expiryDate);

    if (!lotNumber) {
      fail('INVALID_INPUT', `Satır ${index + 1}: LOT numarası zorunludur.`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      fail('INVALID_INPUT', `Satır ${index + 1}: Miktar pozitif bir tam sayı olmalıdır.`);
    }

    return { lotNumber, expiryDate, quantity };
  });

  const seenLotNumbers = new Set();
  for (const { lotNumber } of normalized) {
    if (seenLotNumbers.has(lotNumber)) {
      fail('INVALID_INPUT', `LOT numarası tekrar ediyor: ${lotNumber}`);
    }
    seenLotNumbers.add(lotNumber);
  }

  const total = normalized.reduce((sum, s) => sum + s.quantity, 0);
  if (total !== Number(lot.currentQuantity)) {
    fail(
      'SPLIT_QUANTITY_MISMATCH',
      `Bölüm miktarları toplamı (${total}) mevcut LOT miktarına (${lot.currentQuantity}) eşit olmalıdır.`
    );
  }

  return normalized;
};

module.exports = { validateLotSplit };
