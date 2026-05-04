const XLSX = require('xlsx');

const rows = [
  {
    'Malzeme Kodu':                  'PCR-001',
    'Malzeme Adı':                   'PCR Master Mix',
    'Kategori':                      'Reagent',
    'Departman':                     'Molecular',
    'Birim':                         'kutu',
    'Min Stok':                      5,
    'İdeal Stok Seviyesi (3 aylık)': 15,
    'Maksimum Stok Seviyesi':        20,
    'Mevcut Stok':                   10,
    'Lot No':                        'LOT-2026-001',
    'Son Kullanma':                  '2026-12-31',
    'Marka':                         'Thermo Fisher',
    'Tedarikçi':                     'Thermo Fisher',
    'Ana Birim':                     'kutu',
    'Alt Birim':                     '',
    '1 Ana = Kaç Alt':               '',
    'Tüketim Tipi':                  'PACK'
  },
  {
    'Malzeme Kodu':                  'PCR-001',
    'Malzeme Adı':                   'PCR Master Mix',
    'Kategori':                      'Reagent',
    'Departman':                     'Molecular',
    'Birim':                         'kutu',
    'Min Stok':                      5,
    'İdeal Stok Seviyesi (3 aylık)': 15,
    'Maksimum Stok Seviyesi':        20,
    'Mevcut Stok':                   5,
    'Lot No':                        'LOT-2026-014',
    'Son Kullanma':                  '2026-11-30',
    'Marka':                         'Thermo Fisher',
    'Tedarikçi':                     'Thermo Fisher',
    'Ana Birim':                     'kutu',
    'Alt Birim':                     '',
    '1 Ana = Kaç Alt':               '',
    'Tüketim Tipi':                  'PACK'
  },
  {
    'Malzeme Kodu':                  'TIP-050',
    'Malzeme Adı':                   'Filtered Tips 1000 µl',
    'Kategori':                      'Consumable',
    'Departman':                     'Molecular',
    'Birim':                         'paket',
    'Min Stok':                      10,
    'İdeal Stok Seviyesi (3 aylık)': 35,
    'Maksimum Stok Seviyesi':        45,
    'Mevcut Stok':                   52,
    'Lot No':                        'LOT-2026-TIP7',
    'Son Kullanma':                  '2028-11-30',
    'Marka':                         'Eppendorf',
    'Tedarikçi':                     'Eppendorf',
    'Ana Birim':                     'paket',
    'Alt Birim':                     'adet',
    '1 Ana = Kaç Alt':               96,
    'Tüketim Tipi':                  'UNIT'
  },
  {
    'Malzeme Kodu':                  'TIP-050',
    'Malzeme Adı':                   'Filtered Tips 1000 µl',
    'Kategori':                      'Consumable',
    'Departman':                     'Molecular',
    'Birim':                         'paket',
    'Min Stok':                      10,
    'İdeal Stok Seviyesi (3 aylık)': 35,
    'Maksimum Stok Seviyesi':        45,
    'Mevcut Stok':                   0,
    'Lot No':                        'LOT-2026-TIP9',
    'Son Kullanma':                  '2029-05-31',
    'Marka':                         'Eppendorf',
    'Tedarikçi':                     'Eppendorf',
    'Ana Birim':                     'paket',
    'Alt Birim':                     'adet',
    '1 Ana = Kaç Alt':               96,
    'Tüketim Tipi':                  'UNIT'
  },
  {
    'Malzeme Kodu':                  'RNA-005',
    'Malzeme Adı':                   'RNA Extraction Kit',
    'Kategori':                      'Kit',
    'Departman':                     'Molecular',
    'Birim':                         'kutu',
    'Min Stok':                      2,
    'İdeal Stok Seviyesi (3 aylık)': 6,
    'Maksimum Stok Seviyesi':        10,
    'Mevcut Stok':                   4,
    'Lot No':                        'LOT-2026-118',
    'Son Kullanma':                  '2027-09-30',
    'Marka':                         'QIAGEN',
    'Tedarikçi':                     'QIAGEN',
    'Ana Birim':                     'kutu',
    'Alt Birim':                     'test',
    '1 Ana = Kaç Alt':               50,
    'Tüketim Tipi':                  'TEST'
  },
  {
    'Malzeme Kodu':                  'BUF-101',
    'Malzeme Adı':                   'Tris HCl Buffer 1M',
    'Kategori':                      'Buffer',
    'Departman':                     'Molecular',
    'Birim':                         'şişe',
    'Min Stok':                      3,
    'İdeal Stok Seviyesi (3 aylık)': 9,
    'Maksimum Stok Seviyesi':        12,
    'Mevcut Stok':                   12,
    'Lot No':                        'LOT-2026-BUF2',
    'Son Kullanma':                  '2028-02-28',
    'Marka':                         'Sigma-Aldrich',
    'Tedarikçi':                     'Merck',
    'Ana Birim':                     '',
    'Alt Birim':                     '',
    '1 Ana = Kaç Alt':               '',
    'Tüketim Tipi':                  'PACK'
  }
];

const ws = XLSX.utils.json_to_sheet(rows);

// Set column widths
ws['!cols'] = [
  { wch: 14 }, // Malzeme Kodu
  { wch: 28 }, // Malzeme Adı
  { wch: 14 }, // Kategori
  { wch: 14 }, // Departman
  { wch: 10 }, // Birim
  { wch: 10 }, // Min Stok
  { wch: 26 }, // İdeal Stok
  { wch: 24 }, // Max Stok
  { wch: 12 }, // Mevcut Stok
  { wch: 18 }, // Lot No
  { wch: 14 }, // Son Kullanma
  { wch: 16 }, // Marka
  { wch: 16 }, // Tedarikçi
  { wch: 12 }, // Ana Birim
  { wch: 12 }, // Alt Birim
  { wch: 16 }, // 1 Ana = Kaç Alt
  { wch: 14 }, // Tüketim Tipi
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Malzeme Listesi');
XLSX.writeFile(wb, 'Malzeme_Import_Sablonu.xlsx');

console.log('Template created: Malzeme_Import_Sablonu.xlsx');
