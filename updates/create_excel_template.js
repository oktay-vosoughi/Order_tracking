const XLSX = require('xlsx');

// Create comprehensive Excel template for import
const createTemplate = () => {
  // Template 1: Basic items (no stock)
  const basicItems = [
    {
      'Malzeme Kodu': 'PCR-001',
      'Malzeme Adı': 'PCR Master Mix',
      'Kategori': 'Reagent',
      'Departman': 'Molecular',
      'Birim': 'kutu',
      'Min Stok': 5,
      'Marka': 'Thermo Fisher',
      'Tedarikçi': 'Thermo Fisher',
      'Katalog No': 'AB-12345',
      'Konum': 'Ana Depo',
      'Buzdolabı/Dolap': 'Dolap A-3',
      'Saklama Sıcaklığı': '-20°C',
      'Kimyasal Tipi': 'Nötr'
    },
    {
      'Malzeme Kodu': 'DNA-001',
      'Malzeme Adı': 'DNA Extraction Kit',
      'Kategori': 'Kit',
      'Departman': 'Molecular',
      'Birim': 'kit',
      'Min Stok': 3,
      'Marka': 'Qiagen',
      'Tedarikçi': 'Qiagen',
      'Katalog No': 'QIA-001',
      'Konum': 'Ana Depo',
      'Buzdolabı/Dolap': 'Dolap B-2',
      'Saklama Sıcaklığı': '4°C',
      'Kimyasal Tipi': 'Nötr'
    },
    {
      'Malzeme Kodu': 'PIP-001',
      'Malzeme Adı': 'Pipet 10ml',
      'Kategori': 'Lab Cam',
      'Departman': 'Genel',
      'Birim': 'adet',
      'Min Stok': 50,
      'Marka': 'BrandX',
      'Tedarikçi': 'SupplierY',
      'Katalog No': 'PIP-10ML',
      'Konum': 'Ana Depo',
      'Buzdolabı/Dolap': 'Raf C-1',
      'Saklama Sıcaklığı': 'Oda Sıcaklığı',
      'Kimyasal Tipi': 'Nötr'
    }
  ];

  // Template 2: Items with stock (creates LOTs)
  const itemsWithStock = [
    {
      'Malzeme Kodu': 'PCR-001',
      'Malzeme Adı': 'PCR Master Mix',
      'Departman': 'Molecular',
      'Birim': 'kutu',
      'Min Stok': 5,
      'Mevcut Stok': 10,
      'Lot No': 'LOT-2024-001',
      'Son Kullanma': '2025-12-31',
      'Marka': 'Thermo Fisher',
      'Tedarikçi': 'Thermo Fisher'
    },
    {
      'Malzeme Kodu': 'DNA-001',
      'Malzeme Adı': 'DNA Extraction Kit',
      'Departman': 'Molecular',
      'Birim': 'kit',
      'Min Stok': 3,
      'Mevcut Stok': 5,
      'Lot No': 'DNA-2024-001',
      'Son Kullanma': '2025-06-30',
      'Marka': 'Qiagen',
      'Tedarikçi': 'Qiagen'
    },
    {
      'Malzeme Kodu': 'PIP-001',
      'Malzeme Adı': 'Pipet 10ml',
      'Departman': 'Genel',
      'Birim': 'adet',
      'Min Stok': 50,
      'Mevcut Stok': 100,
      'Lot No': 'PIP-2024-001',
      'Son Kullanma': '2026-12-31',
      'Marka': 'BrandX',
      'Tedarikçi': 'SupplierY'
    }
  ];

  // Template 3: Multiple LOTs for same item
  const multipleLots = [
    {
      'Malzeme Kodu': 'PCR-001',
      'Malzeme Adı': 'PCR Master Mix',
      'Departman': 'Molecular',
      'Birim': 'kutu',
      'Min Stok': 5,
      'Mevcut Stok': 10,
      'Lot No': 'LOT-2024-001',
      'Son Kullanma': '2025-12-31'
    },
    {
      'Malzeme Kodu': 'PCR-001',
      'Malzeme Adı': 'PCR Master Mix',
      'Departman': 'Molecular',
      'Birim': 'kutu',
      'Min Stok': 5,
      'Mevcut Stok': 15,
      'Lot No': 'LOT-2024-002',
      'Son Kullanma': '2026-03-15'
    },
    {
      'Malzeme Kodu': 'PCR-001',
      'Malzeme Adı': 'PCR Master Mix',
      'Departman': 'Molecular',
      'Birim': 'kutu',
      'Min Stok': 5,
      'Mevcut Stok': 8,
      'Lot No': 'LOT-2024-003',
      'Son Kullanma': '2025-06-30'
    }
  ];

  // Create workbook with multiple sheets
  const wb = XLSX.utils.book_new();

  // Sheet 1: Basic Items (No Stock)
  const ws1 = XLSX.utils.json_to_sheet(basicItems);
  XLSX.utils.book_append_sheet(wb, ws1, 'Temel Malzemeler');

  // Sheet 2: Items with Stock
  const ws2 = XLSX.utils.json_to_sheet(itemsWithStock);
  XLSX.utils.book_append_sheet(wb, ws2, 'Stoklu Malzemeler');

  // Sheet 3: Multiple LOTs Example
  const ws3 = XLSX.utils.json_to_sheet(multipleLots);
  XLSX.utils.book_append_sheet(wb, ws3, 'Çoklu LOT Örneği');

  // Sheet 4: Empty Template
  const emptyTemplate = [
    {
      'Malzeme Kodu': '',
      'Malzeme Adı': '',
      'Kategori': '',
      'Departman': '',
      'Birim': '',
      'Min Stok': '',
      'Mevcut Stok': '',
      'Lot No': '',
      'Son Kullanma': '',
      'Marka': '',
      'Tedarikçi': '',
      'Katalog No': '',
      'Konum': '',
      'Buzdolabı/Dolap': '',
      'Saklama Sıcaklığı': '',
      'Kimyasal Tipi': ''
    }
  ];
  const ws4 = XLSX.utils.json_to_sheet(emptyTemplate);
  XLSX.utils.book_append_sheet(wb, ws4, 'Boş Şablon');

  // Save the file
  XLSX.writeFile(wb, 'Malzeme_Import_Sablonlari.xlsx');
  console.log('Excel template created: Malzeme_Import_Sablonlari.xlsx');
  console.log('\nSheets created:');
  console.log('1. Temel Malzemeler - Items without stock');
  console.log('2. Stoklu Malzemeler - Items with stock (creates LOTs)');
  console.log('3. Çoklu LOT Örneği - Multiple LOTs for same item');
  console.log('4. Boş Şablon - Empty template for your data');
};

createTemplate();
