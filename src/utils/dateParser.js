const EXCEL_EPOCH_OFFSET = 25569; // Days between Excel epoch (1899-12-30) and Unix epoch

/**
 * Parse and validate ISO date format (yyyy-MM-dd)
 * @param {string} dateStr - Date string in ISO format
 * @returns {Date|null}
 */
export function parseISODate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const trimmed = dateStr.trim();
  
  // Strict ISO format: YYYY-MM-DD
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  
  // Validate ranges
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2200) {
    return null;
  }
  
  // Create date (month is 0-indexed in JavaScript)
  const date = new Date(year, month - 1, day);
  
  // Verify the date is valid (handles invalid dates like 2025-02-31)
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
    return null;
  }
  
  return date;
}

/**
 * Validate date is within acceptable range for lab inventory
 * @param {Date} date - Date object
 * @returns {boolean}
 */
export function isValidInventoryDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return false;
  }
  
  const year = date.getFullYear();
  // Lab inventory dates should be between 2000 and 2100
  return year >= 2000 && year <= 2100;
}

/**
 * Format Date object to MySQL DATE format (yyyy-MM-dd)
 * @param {Date} date - Date object
 * @returns {string}
 */
export function formatDateForMySQL(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format Date object to Turkish display format (dd.MM.yyyy)
 * @param {Date} date - Date object
 * @returns {string}
 */
export function formatDateForDisplay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${day}.${month}.${year}`;
}

/**
 * Normalize expiry date for LIMS inventory
 * Input is expected to be ISO format (YYYY-MM-DD) from Excel
 * 
 * @param {*} value - Raw value from Excel cell (expected: string "YYYY-MM-DD")
 * @returns {string|null} - MySQL DATE format (yyyy-MM-dd) or null if invalid
 */
export function normalizeExpiryDate(value) {
  // Handle null/undefined/empty
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  let date = null;
  
  // Case 1: Already a Date object
  if (value instanceof Date) {
    date = value;
  }
  // Case 2: String (expected case - ISO format from Excel)
  else if (typeof value === 'string') {
    date = parseISODate(value);
    if (date) {
      console.log(`[DateParser] ISO format "${value}" → ${formatDateForDisplay(date)}`);
    }
  }
  // Case 3: Number (Excel serial or timestamp)
  else if (typeof value === 'number') {
    if (value > 59 && value < 100000) {
      const ms = (value - EXCEL_EPOCH_OFFSET) * 86400 * 1000;
      date = new Date(ms);
    } else if (value > 1000000000 && value < 10000000000) {
      date = new Date(value * 1000); // Unix timestamp in seconds
    } else if (value >= 10000000000) {
      date = new Date(value); // Unix timestamp in milliseconds
    }
  }
  // Case 4: Numeric string (Excel serial stored as text)
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const numeric = Number(value.trim());
    if (numeric > 59 && numeric < 100000) {
      const ms = (numeric - EXCEL_EPOCH_OFFSET) * 86400 * 1000;
      date = new Date(ms);
    }
  }
  
  // Validate the parsed date
  if (!date || !isValidInventoryDate(date)) {
    console.warn(`[DateParser] Invalid or out-of-range date: ${value} → ${date}`);
    return null;
  }
  
  // Return in MySQL format
  return formatDateForMySQL(date);
}

// Alias for backward compatibility
export const parseSKTDate = normalizeExpiryDate;

/**
 * Calculate days until expiry
 * @param {string} sktDate - MySQL DATE format (yyyy-MM-dd)
 * @returns {number} - Days until expiry (negative if expired)
 */
export function calculateDaysUntilExpiry(sktDate) {
  if (!sktDate) return null;
  
  const expiry = new Date(sktDate);
  const today = new Date();
  
  // Reset time to midnight for accurate day calculation
  expiry.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffMs = expiry - today;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Get expiry status for display
 * @param {string} sktDate - MySQL DATE format (yyyy-MM-dd)
 * @returns {object} - { status: 'expired'|'warning'|'ok', daysLeft: number, label: string }
 */
export function getExpiryStatus(sktDate) {
  if (!sktDate) {
    return { status: 'unknown', daysLeft: null, label: 'SKT Yok' };
  }
  
  const daysLeft = calculateDaysUntilExpiry(sktDate);
  
  if (daysLeft < 0) {
    return { 
      status: 'expired', 
      daysLeft: Math.abs(daysLeft), 
      label: `Süresi Dolmuş (${Math.abs(daysLeft)} gün önce)` 
    };
  } else if (daysLeft <= 30) {
    return { 
      status: 'warning', 
      daysLeft, 
      label: `${daysLeft} Gün Kaldı` 
    };
  } else {
    return { 
      status: 'ok', 
      daysLeft, 
      label: `${daysLeft} Gün Kaldı` 
    };
  }
}

// Export all functions
export default {
  parseISODate,
  isValidInventoryDate,
  formatDateForMySQL,
  formatDateForDisplay,
  normalizeExpiryDate,
  parseSKTDate,
  calculateDaysUntilExpiry,
  getExpiryStatus
};
