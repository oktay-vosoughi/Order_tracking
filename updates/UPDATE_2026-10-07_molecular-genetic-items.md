# UPDATE 2026-10-07 — Moleküler Genetik malzeme eklemesi

## Summary

- Moleküler Genetik için 15230, LB.IS.089.03.012P ve LB.IS.078.05.025 kodlu malzemeleri ekleyen tekrar çalıştırılabilir migration hazırlandı.
- 15230 için kritik/ideal/maksimum stok seviyeleri sırasıyla 1/2/3 olarak tanımlandı.
- Görselde stok limiti bulunmayan iki ISOLAB malzemesinin üç limiti de 0 olarak tanımlandı.
- Başlangıç stoku 0 bırakıldı; stok gerçeği LOT tablosu olduğu için sıfır miktarlı veya sahte LOT oluşturulmadı.

## Files touched

- `server/migrations/2026_10_07_add_molecular_genetic_items.sql`
- `updates/UPDATE_2026-10-07_molecular-genetic-items.md`

## DB changes

- Eksik ürünler `item_definitions` tablosuna eklenir.
- Ürünler `item_departments` üzerinden yalnızca `Moleküler Genetik` departmanına bağlanır.
- Aynı kod önceden varsa ürün çoğaltılmaz; sağlanan ad, marka, birim ve stok limitleri uygulanır. Mevcut başka departman üyelikleri ve tüm LOT kayıtları korunur.
- İlk çalıştırma öncesi mevcut hedef ürünler `molecular_genetic_items_20261007_item_backup` tablosuna alınır. Migrationın oluşturduğu ürün kimlikleri `molecular_genetic_items_20261007_created`, eklediği departman üyelikleri `molecular_genetic_items_20261007_department_added` tablosunda tutulur.

Proje kökünden uygulama:

```sh
(cd server && node run-migration.js 2026_10_07_add_molecular_genetic_items.sql)
```

## Rollback SQL

Yeni ürünlere LOT, talep veya başka hareket bağlanmadan çalıştırılmalıdır.

```sql
START TRANSACTION;

DELETE idp
FROM item_departments idp
JOIN molecular_genetic_items_20261007_department_added a
  ON a.itemDefinitionId = idp.itemDefinitionId
 AND a.department = idp.department;

UPDATE item_definitions i
JOIN molecular_genetic_items_20261007_item_backup b ON b.id = i.id
SET i.name = b.name,
    i.department = b.department,
    i.unit = b.unit,
    i.minStock = b.minStock,
    i.ideal_stock = b.ideal_stock,
    i.max_stock = b.max_stock,
    i.catalogNo = b.catalogNo,
    i.brand = b.brand,
    i.packageUnit = b.packageUnit,
    i.consumptionUnit = b.consumptionUnit,
    i.unitsPerPackage = b.unitsPerPackage,
    i.consumptionUnitType = b.consumptionUnitType,
    i.status = b.status,
    i.updatedBy = b.updatedBy;

DELETE i
FROM item_definitions i
JOIN molecular_genetic_items_20261007_created c ON c.id = i.id;

COMMIT;
```

## Test steps

- Migration SQL sözdizimi ve tekrar çalıştırma davranışı test veritabanında doğrulanır.
- Sonuç sorgusunda üç ürün, `Moleküler Genetik` departmanı, 1/2/3 ve 0/0/0 limitleri ile stok 0 görülmelidir.
- Uygulamada Moleküler Genetik filtresinde üç ürünün görünmesi, başka departmanın LOT ve üyeliklerinin değişmemesi kontrol edilir.

## Risks

- ISOLAB ürünlerinin görselde birimi verilmediği için `Adet`; 15230 için görseldeki birim `Kutu` kullanıldı. Ambalaj bilgisi daha sonra netleşirse ürün tanımından düzeltilebilir.
- Ürün kodlarından biri başka departmanda zaten kullanılıyorsa ürün tanımı ortaktır; ad, marka, birim ve limit alanları da ortak kalır. Departman stok miktarları LOT seviyesinde ayrıdır ve bu migration LOT değiştirmez.
