# UPDATE 2026-10-01 — MX-24L ve Artus tüketim birimleri

## Summary
- BS-SY-MX24L-100-30RxN: ana depo ve dağıtım kutu, tüketim reax, 1 kutu = 30 reax.
- Artus EBV, BK, CMV: ana depo, dağıtım ve tüketim kutu. Biten kutu için tüketim miktarı 1 girilir. Mevcut talep kuralı, cep depo bakiyesi bitince yeni kutu talebine izin verir.

## Scope / project
- Order_tracking, mevcut MySQL ürün verileri. Uygulamanın mevcut PACK/UNIT akışı kullanılır.

## Files touched
- `server/migrations/2026_10_01_mx24l_artus_units.sql`
- Bu değişiklik kaydı.

## DB changes
- Şema sözleşmesi değişmez. Ürün tanımları, lot dönüşüm değerleri ve cep depo tüketim bakiyeleri beraber güncellenir.
- Tam olarak bir MX-24L, bir Artus EBV, bir Artus BK ve bir Artus CMV aktif kaydı aranır. Eksik/çoklu kayıt varsa uygulama durur.
- Ana depo miktarlarının önceden kutu cinsinden olması gerekir. Reaksiyon cinsinden depo miktarları otomatik olarak yeniden etiketlenmez. Böyle kayıtlar varsa canlı lot miktarları ve kutu kapasitesi ayrıca doğrulanmalıdır.
- MX-24L mevcut reaksiyon bakiyesi yalnızca mevcut çarpan 30 ve birim reaksiyon ise korunur. PACK bakiyesi `packQty * 30` olur.
- Artus `packQty` korunur, `unitQty = packQty` olur. Mevcut kısmi kutuların fiziksel kutu sayısı uygulamadan önce doğrulanmalıdır.
- Lot miktarları, stok eşikleri, bölüm sahipliği ve geçmiş işlem kayıtları korunur. Lot çarpanları da düzeltilir; eski lot ayarı yeni dağıtımlarda ürün ayarını ezmez.
- İlk durum `unit_fix_20261001_items`, `unit_fix_20261001_lots`, `unit_fix_20261001_balances` tablolarında saklanır.
- MySQL 8.0.16 veya üstü gerekir (CHECK denetimi). Bakım sırasında, yeni tüketim/dağıtım yapılmadan uygulanmalıdır.

Apply (proje kökünden):

```sh
(cd server && node run-migration.js 2026_10_01_mx24l_artus_units.sql)
```

## How to revert
Yeni tüketim/dağıtım gerçekleşmeden aşağıdaki SQL çalıştırılır. Daha sonra geri dönüş gerekirse güncel bakiyeler ayrıca uzlaştırılmalıdır.

```sql
START TRANSACTION;
UPDATE item_definitions i JOIN unit_fix_20261001_items b ON b.id = i.id
SET i.unit = b.unit, i.packageUnit = b.packageUnit,
    i.consumptionUnit = b.consumptionUnit, i.unitsPerPackage = b.unitsPerPackage,
    i.consumptionUnitType = b.consumptionUnitType;
UPDATE lots l JOIN unit_fix_20261001_lots b ON b.id = l.id
SET l.unitsPerPackage = b.unitsPerPackage,
    l.consumptionUnitType = b.consumptionUnitType;
UPDATE cep_depo_balances c JOIN unit_fix_20261001_balances b ON b.id = c.id
SET c.packQty = b.packQty, c.unitQty = b.unitQty,
    c.consumptionUnitType = b.consumptionUnitType;
COMMIT;
```

Yalnız bu migration ve değişiklik kaydını kaldırın. Uygulama yeniden başlatılması gerekmez, ekran verileri yenilenmelidir.

## Test steps performed
- Yerel veritabanına salt okunur bağlantı kuruldu. İstenen ürünler bulunamadı, gerçek verilere migration uygulanmadı.
- Bağlantıya özel geçici MySQL tablolarında altı kontrol geçti: mevcut 17 reax bakiyesinin korunması ve tekrar çalıştırma, PACK bakiyesinin 30 reax'a dönüşmesi, eksik ürünün reddi, RxN depo biriminin değişiklik yapılmadan reddi, belirsiz MX-24L çarpanının reddi, çoklu Artus kaydının reddi. Artus bakiyeleri 1 kutu, lot miktarları 5 kutu olarak doğrulandı, hedef dışındaki ürün değişmedi. İlk yedek tekrar çalıştırmada korundu. Gerçek uygulama tablolarına yazılmadı.
- Ekran kontrolü: MX-24L 1 kutu dağıtılınca 30 reax görünmeli, 1 reax tüketilince 29 reax kalmalı. Artus 1 kutu dağıtılınca 1 kutu görünmeli, bitince 1 kutu tüketilerek bakiye sıfırlanmalı.

## Risks / open questions
- Canlı veritabanı kayıtları ve erişimi henüz doğrulanmadı. Canlı uygulama ve ekran kontrolü yapılmadı.
- Adında `BK` yerine başka kısaltma bulunan Artus varyantı veya çoklu ürün varsa kodları doğrulanarak hedef seçimi güncellenmelidir.
- Depodan çıkış mevcut dağıtım işleminde gerçekleşir. Kutunun bittiğinin kaydı cep depo tüketimidir, ayrıca ikinci depo çıkışı yapılmaz.
