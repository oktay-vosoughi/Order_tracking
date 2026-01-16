// Laboratory-specific utility functions

// Chemical compatibility rules based on laboratory safety standards
export const CHEMICAL_TYPES = {
  ACID: 'Asit',
  BASE: 'Baz',
  OXIDIZER: 'Oksitleyici',
  FLAMMABLE: 'Yanıcı',
  TOXIC: 'Toksik',
  CORROSIVE: 'Aşındırıcı',
  REACTIVE: 'Reaktif',
  NEUTRAL: 'Nötr'
};

// Storage temperature categories
export const STORAGE_TEMPS = {
  ROOM_TEMP: 'Oda Sıcaklığı (RT)',
  FRIDGE: 'Buzdolabı (+2/+8°C)',
  FREEZER_MINUS_20: 'Derin Dondurucu (-20°C)',
  FREEZER_MINUS_80: 'Ultra Derin Dondurucu (-80°C)',
  DARK: 'Işıktan Korumalı'
};

// Waste types
export const WASTE_TYPES = {
  EXPIRED: 'Miadı Dolmuş',
  CONTAMINATED: 'Kontamine',
  DAMAGED: 'Hasarlı',
  RECALLED: 'Geri Çağrılmış'
};

// Departments
export const DEPARTMENTS = {
  CYTOGENETIC: 'Cytogenetic',
  MOLECULAR: 'Molecular',
  NUMUNE_KABUL: 'Numune Kabul',
  OTHER: 'Diğer'
};

// Chemical compatibility matrix - incompatible pairs
const INCOMPATIBLE_PAIRS = [
  ['ACID', 'BASE'],
  ['OXIDIZER', 'FLAMMABLE'],
  ['OXIDIZER', 'REACTIVE'],
  ['ACID', 'REACTIVE']
];

// Check if two chemical types are incompatible
export const areChemicalsIncompatible = (type1, type2) => {
  if (!type1 || !type2 || type1 === 'NEUTRAL' || type2 === 'NEUTRAL') return false;
  
  return INCOMPATIBLE_PAIRS.some(pair => 
    (pair[0] === type1 && pair[1] === type2) || 
    (pair[0] === type2 && pair[1] === type1)
  );
};

// Get compatibility warning message
export const getCompatibilityWarning = (type1, type2) => {
  if (areChemicalsIncompatible(type1, type2)) {
    return `⚠️ UYARI: ${CHEMICAL_TYPES[type1]} ve ${CHEMICAL_TYPES[type2]} birlikte saklanamaz!`;
  }
  return null;
};

// Calculate days until expiry
export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

// Get expiry status with color coding
export const getExpiryStatus = (expiryDate) => {
  const days = getDaysUntilExpiry(expiryDate);
  
  if (days === null) return { status: 'UNKNOWN', color: 'gray', label: 'SKT Yok' };
  if (days < 0) return { status: 'EXPIRED', color: 'red', label: 'Süresi Dolmuş', days };
  if (days === 0) return { status: 'EXPIRES_TODAY', color: 'red', label: 'Bugün Doluyor', days };
  if (days <= 7) return { status: 'CRITICAL', color: 'red', label: `${days} Gün Kaldı`, days };
  if (days <= 30) return { status: 'WARNING', color: 'orange', label: `${days} Gün Kaldı`, days };
  if (days <= 90) return { status: 'ATTENTION', color: 'yellow', label: `${days} Gün Kaldı`, days };
  
  return { status: 'GOOD', color: 'green', label: `${days} Gün Kaldı`, days };
};

// FEFO sorting - sort items by expiry date (earliest first)
export const sortByFEFO = (items) => {
  return [...items].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    
    return new Date(a.expiryDate) - new Date(b.expiryDate);
  });
};

// Check if item needs opening date tracking
export const needsOpeningDate = (item) => {
  return item.currentStock > 0 && !item.openingDate;
};

// Calculate days since opening
export const getDaysSinceOpening = (openingDate) => {
  if (!openingDate) return null;
  
  const opened = new Date(openingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  opened.setHours(0, 0, 0, 0);
  
  const diffTime = today - opened;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

// Get items expiring soon (within days threshold)
export const getExpiringItems = (items, daysThreshold = 30) => {
  return items.filter(item => {
    const days = getDaysUntilExpiry(item.expiryDate);
    return days !== null && days >= 0 && days <= daysThreshold;
  }).sort((a, b) => {
    const daysA = getDaysUntilExpiry(a.expiryDate);
    const daysB = getDaysUntilExpiry(b.expiryDate);
    return daysA - daysB;
  });
};

// Get expired items
export const getExpiredItems = (items) => {
  return items.filter(item => {
    const days = getDaysUntilExpiry(item.expiryDate);
    return days !== null && days < 0;
  });
};

// Generate counting schedule dates
export const generateCountingSchedule = (year, month) => {
  const schedules = [];
  
  // 1st and 15th of each month for monthly counting
  schedules.push({
    date: new Date(year, month, 1),
    type: 'MONTHLY',
    label: 'Aylık Sayım (1. Gün)'
  });
  
  schedules.push({
    date: new Date(year, month, 15),
    type: 'MONTHLY',
    label: 'Aylık Sayım (15. Gün)'
  });
  
  return schedules;
};

// Check if counting is due
export const isCountingDue = (lastCountingDate, scheduleType = 'MONTHLY') => {
  if (!lastCountingDate) return true;
  
  const last = new Date(lastCountingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
  
  if (scheduleType === 'WEEKLY') return diffDays >= 7;
  if (scheduleType === 'MONTHLY') return diffDays >= 14; // 15 days for bi-monthly
  
  return false;
};

// Validate MSDS URL
export const isValidMSDSUrl = (url) => {
  if (!url) return true; // Optional field
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Format date for display
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleDateString('tr-TR');
  } catch {
    return dateString;
  }
};

// Get color class for expiry status
export const getExpiryColorClass = (expiryDate) => {
  const status = getExpiryStatus(expiryDate);
  
  const colorMap = {
    'red': 'bg-red-100 text-red-800 border-red-300',
    'orange': 'bg-orange-100 text-orange-800 border-orange-300',
    'yellow': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'green': 'bg-green-100 text-green-800 border-green-300',
    'gray': 'bg-gray-100 text-gray-800 border-gray-300'
  };
  
  return colorMap[status.color] || colorMap['gray'];
};
