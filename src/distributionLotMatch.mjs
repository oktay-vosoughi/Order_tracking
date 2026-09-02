const normalizeLotNumber = (value) => String(value ?? '').trim().toUpperCase();

const normalizeExpiryDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

// A scan may contain LOT, SKT, or both. Only return a result when exactly one
// active stock lot matches every value carried by the barcode; ambiguous SKT-only
// matches deliberately stay manual so stock cannot be deducted from the wrong lot.
export function findScannedDistributionLot(lots = [], scan = {}) {
  const scannedLot = normalizeLotNumber(scan.lotNumber);
  const scannedExpiry = normalizeExpiryDate(scan.expiryDate);
  if (!scannedLot && !scannedExpiry) return null;

  const matches = lots.filter((lot) => {
    if (scannedLot && normalizeLotNumber(lot.lotNumber) !== scannedLot) return false;
    if (scannedExpiry && normalizeExpiryDate(lot.expiryDate) !== scannedExpiry) return false;
    return true;
  });

  return matches.length === 1 ? matches[0] : null;
}

