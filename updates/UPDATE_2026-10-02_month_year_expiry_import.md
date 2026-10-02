# UPDATE 2026-10-02 — Ay-yıl SKT içe aktarma

## Summary
- Excel SKT alanında yalnız ay ve yıl varsa gün `1` kabul edilir. Örneğin `11.2026`, `01.11.2026` yerine veritabanına `2026-11-01` olarak gider.
- LY-F064 sayım dosyalarında `X50rxn`, `X96reax`, `X(12rxn)` ve `X48rxn(12rxn)` gibi reaksiyon miktarı açıklamaları desteklenir.
- Departman sütunu olmayan sayım dosyaları için yükleme ekranında hedef departman seçilir. Dosyada departmanı boş olan satırlar bu seçime bağlanır; dosyada açıkça yazılı departmanlar korunur.
- ADMIN, hedef departmanı açıkça seçerek eski departmansız LOT'u bu departmana bağlayabilir. Başka departmanda aynı ürün/LOT varsa o kayıt korunur ve hedef departman için ayrı LOT oluşturulur.
- Aynı ürün ve LOT numarası SİTOGENETİK, Moleküler Genetik veya Moleküler Mikro'da ayrı stoklar olarak tutulur. Excel yüklemesi yalnız satırdaki/hedef seçimindeki departmanın LOT miktarını günceller; diğer departmanların aynı ürününe dokunmaz.

## Scope / project
- Order_tracking frontend Excel ayrıştırma ve LY-F064 sayım formu içe aktarma.

## Files touched
- `src/utils/lyF064Importer.mjs` — ay-yıl tarihi ve reaksiyon miktarı yazımlarını ayrıştırır.
- `src/utils/lotExcelImporter.js` — standart Excel alanlarında ay-yıl değerini ayın ilk gününe çevirir.
- `src/App.jsx` ve `src/LotInventory.jsx` — Excel hedef departmanı seçimi.
- `server/stockWriteScope.cjs` ve `server/index.js` — LOT arama/güncellemesini departmanla sınırlar, eski departmansız LOT onarımını destekler ve CEP birim bakiyesi güncellemesini hedef departmanla sınırlar.
- `server/stockWriteScope.test.cjs` — departmansız LOT onarım yetkisini doğrular.
- `server/excelImport.test.cjs` — aynı ürün ve LOT numarasının iki departmanda bağımsız kaldığını doğrular.
- `server/migrations/2026_10_02_department_scoped_lot_identity.sql` — LOT tekilliğine departmanı ekler.
- `src/utils/lyF064Importer.test.mjs` — gerçek dosyadaki reaksiyonlu örnekleri doğrular.
- `src/utils/lotExcelImporter.test.mjs` — standart tarih normalizasyonunu doğrular.
- `src/utils/dateParser.js` ve `src/utils/dateParser.test.mjs` — ortak SKT yardımcısında aynı ay-yıl kuralını uygular ve doğrular.

## DB changes
- `lots` tablosundaki `uniq_item_lot (itemId, lotNumber)` indeksi, `uniq_item_lot_department (itemId, lotNumber, department)` olur.
- Uygulama: `cd server && node run-migration.js 2026_10_02_department_scoped_lot_identity.sql`.
- Rollback öncesinde aynı ürün/LOT numarasının birden fazla departmanda bulunmadığını doğrulayın. Ardından:

```sql
ALTER TABLE lots DROP INDEX uniq_item_lot_department;
ALTER TABLE lots ADD UNIQUE KEY uniq_item_lot (itemId, lotNumber);
```

## How to revert
1. Aynı ürün/LOT numarası farklı departmanlarda oluştuysa önce kayıtları uzlaştırın.
2. Yukarıdaki rollback SQL'ini çalıştırın.
3. Bu güncellemedeki kaynak ve test değişikliklerini geri alın.
4. Frontend'i yeniden derleyip yayımlayın.

## Test steps performed
- `npm test`: 157 test geçti.
- `npm run build`: üretim derlemesi başarılı.
- `02102026_Malzeme Sayım ve Stok Takip.xlsx` gerçek içe aktarma fonksiyonundan hatasız geçti: 64 malzeme için 78 LOT üretildi.
- Sorunlu üç satır doğrulandı: ABVZV2 `2028-05-01/50` ve `2026-08-01/3`; BS-SY-WCOR `2026-11-01/240` ve `2026-09-01/96`; BS-SY-MX24L `2027-01-01/48`, `2027-02-01/30`, `2026-12-01/12`.
- Gerçek dosyaya `Moleküler Mikro` hedefi uygulandığında 78 LOT'un tamamının bu departmana bağlandığı ve boş departman kalmadığı doğrulandı.
- Departman bazlı LOT migrationı geçici MySQL veritabanında iki kez çalıştırıldı; aynı ürün/LOT numarasının SİTOGENETİK ve Moleküler Genetik için ayrı kaydedilebildiği doğrulandı.

## Risks / open questions
- Ay-yıl ile verilen SKT için kullanıcının istediği şekilde ayın ilk günü kaydedilir; ürün o gün dolmuş kabul edilir.
- Parantez içindeki `rxn/reax` değeri, `X` sonrasında ayrıca açık miktar yoksa LOT miktarıdır. Açık miktar varsa parantez içi paket kapasitesi açıklaması olarak tutulmaz.
- Migration koddan önce uygulanmalıdır. Aksi halde aynı ürün ve LOT numarasının ikinci departmana eklenmesi eski tekillik indeksi nedeniyle reddedilir.
