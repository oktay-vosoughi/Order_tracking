const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const outputPath = path.join(
  __dirname,
  '..',
  `cep_depo_birim_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`
);

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'order_Tracking'
};

const allRowsSql = `
SELECT
  i.code AS \`Kod\`,
  i.name AS \`Malzeme\`,
  i.brand AS \`Marka\`,
  i.department AS \`Departman\`,
  i.category AS \`Kategori\`,
  i.unit AS \`Ana Depo Birimi\`,
  i.packageUnit AS \`Paket Birimi\`,
  i.consumptionUnit AS \`CEP DEPO Harcama Birimi\`,
  i.unitsPerPackage AS \`1 Paket Kaç Alt Birim\`,
  i.consumptionUnitType AS \`Tüketim Tipi\`,
  COALESCE(stock.totalStock, 0) AS \`Ana Depo Stok\`,
  i.ideal_stock AS \`Ideal Stok\`,
  CONCAT(
    COALESCE(stock.totalStock, 0),
    ' / ',
    COALESCE(i.ideal_stock, i.minStock),
    ' ',
    COALESCE(i.unit, 'birim')
  ) AS \`Ana Depoda Görünüm\`,
  COALESCE(cep.labTechnicianUsername, '-') AS \`CEP DEPO Kullanıcı\`,
  cep.packQty AS \`CEP Paket Miktarı\`,
  cep.unitQty AS \`CEP Alt Birim Miktarı\`,
  CASE
    WHEN cep.id IS NULL THEN 'CEP DEPO yok'
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NOT NULL
      THEN CONCAT(cep.unitQty, ' ', i.consumptionUnit)
    ELSE CONCAT(cep.packQty, ' ', COALESCE(i.packageUnit, i.unit, 'birim'))
  END AS \`CEP DEPOda Görünüm\`,
  CASE
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NOT NULL
      THEN i.consumptionUnit
    ELSE COALESCE(i.packageUnit, i.unit, 'birim')
  END AS \`Harcanırken Seçilecek Birim\`,
  CASE
    WHEN i.consumptionUnitType <> 'PACK'
      AND i.unitsPerPackage IS NOT NULL
      AND cep.id IS NOT NULL
      THEN ROUND(cep.packQty * i.unitsPerPackage, 2)
    ELSE NULL
  END AS \`Beklenen Alt Birim\`,
  CASE
    WHEN i.consumptionUnitType = 'PACK' THEN 'OK - Paket tüketimi'
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NULL THEN 'HATA - Alt birim yok'
    WHEN i.consumptionUnitType <> 'PACK' AND (i.unitsPerPackage IS NULL OR i.unitsPerPackage <= 0) THEN 'HATA - Çarpan yok'
    WHEN cep.id IS NULL THEN 'OK - CEP DEPO bakiyesi yok'
    WHEN ABS(cep.unitQty - (cep.packQty * i.unitsPerPackage)) > 0.01 THEN 'UYARI - packQty/unitQty tutarsız'
    ELSE 'OK'
  END AS \`Kontrol\`
FROM item_definitions i
LEFT JOIN (
  SELECT
    itemId,
    SUM(CASE WHEN status = 'ACTIVE' AND currentQuantity > 0 THEN currentQuantity ELSE 0 END) AS totalStock
  FROM lots
  GROUP BY itemId
) stock ON stock.itemId = i.id
LEFT JOIN cep_depo_balances cep
  ON cep.itemId = i.id
  AND cep.status = 'ACTIVE'
WHERE i.status = 'ACTIVE'
ORDER BY
  i.department,
  i.category,
  i.code,
  cep.labTechnicianUsername
`;

const issueRowsSql = `
SELECT *
FROM (
  SELECT
    i.code AS \`Kod\`,
    i.name AS \`Malzeme\`,
    i.unit AS \`Ana Depo Birimi\`,
    i.packageUnit AS \`Paket Birimi\`,
    i.consumptionUnit AS \`CEP DEPO Harcama Birimi\`,
    i.unitsPerPackage AS \`1 Paket Kaç Alt Birim\`,
    i.consumptionUnitType AS \`Tüketim Tipi\`,
    b.labTechnicianUsername AS \`CEP DEPO Kullanıcı\`,
    b.packQty AS \`CEP Paket Miktarı\`,
    b.unitQty AS \`CEP Alt Birim Miktarı\`,
    CASE
      WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NULL THEN 'HATA - Alt birim yok'
      WHEN i.consumptionUnitType <> 'PACK' AND (i.unitsPerPackage IS NULL OR i.unitsPerPackage <= 0) THEN 'HATA - Çarpan yok'
      WHEN b.id IS NOT NULL AND i.consumptionUnitType <> 'PACK'
        AND ABS(b.unitQty - (b.packQty * i.unitsPerPackage)) > 0.01 THEN 'UYARI - packQty/unitQty tutarsız'
      ELSE 'OK'
    END AS \`Kontrol\`
  FROM item_definitions i
  LEFT JOIN cep_depo_balances b ON b.itemId = i.id AND b.status = 'ACTIVE'
  WHERE i.status = 'ACTIVE'
) x
WHERE \`Kontrol\` <> 'OK'
ORDER BY \`Kod\`
`;

const addSheet = (workbook, sheetName, rows) => {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = Object.keys(rows[0] || { Bos: '' }).map((key) => ({
    wch: Math.min(Math.max(key.length + 4, 14), 40)
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
};

(async () => {
  const pool = mysql.createPool(dbConfig);
  try {
    const [allRows] = await pool.query(allRowsSql);
    const [issueRows] = await pool.query(issueRowsSql);

    const workbook = XLSX.utils.book_new();
    addSheet(workbook, 'Tüm Malzemeler', allRows);
    addSheet(workbook, 'Sorunlu Kayıtlar', issueRows.length ? issueRows : [{ Bilgi: 'Sorunlu kayıt bulunmadı' }]);

    XLSX.writeFile(workbook, outputPath);

    console.log(`Excel oluşturuldu: ${outputPath}`);
    console.log(`Tüm malzemeler: ${allRows.length}`);
    console.log(`Sorunlu kayıtlar: ${issueRows.length}`);
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error('Excel export başarısız:', error.message);
  process.exit(1);
});
