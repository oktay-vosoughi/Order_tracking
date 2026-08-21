# UPDATE 2026-08-21 — Eksik EBYS sütunlarını onarma

## Summary

- Sunucuda EBYS formu indirilirken oluşan `Unknown column 'p.ebysBatchId'` hatası için geriye uyumlu bir onarım migration'ı eklendi.
- Migration mevcut `ebys_batches` tablosunu korur ve `purchases.ebysBatchId` ile `purchases.ebysReference` sütunlarını eksikse tamamlar.

## Scope / project

- Order tracking backend veritabanı migration'ı.

## Files touched

- `server/migrations/2026-08-21-repair-ebys-batches.sql` — eski MySQL sürümlerinde de ayrıştırılabilen EBYS şema onarımı.
- `updates/UPDATE_2026-08-21_repair_missing_ebys_columns.md` — uygulama, doğrulama ve geri alma notları.

## DB changes (if any)

- Migration: `server/migrations/2026-08-21-repair-ebys-batches.sql`.
- Apply from the project root with the server DB environment loaded:
  `node server/run-migration.js 2026-08-21-repair-ebys-batches.sql`
- Rollback SQL (yalnızca bu alanlarda EBYS verisi tutulmadığı doğrulanırsa):

```sql
ALTER TABLE purchases DROP COLUMN ebysReference, DROP COLUMN ebysBatchId;
DROP TABLE IF EXISTS ebys_batches;
```

## How to revert

1. Önce EBYS geçmişinin gerekli olmadığını doğrulayın.
2. Yukarıdaki rollback SQL'ini çalıştırın.
3. Migration ve bu update dosyasını geri alın.
4. EBYS batch alanlarını kullanan uygulama sürümüne geçmeyin; aksi halde aynı hata geri gelir.

## Test steps performed

- Migration SQL'indeki üç ifade ayrı çalışacak şekilde `server/run-migration.js` davranışıyla kontrol edildi.
- Mevcut sütunlarda runner'ın `ER_DUP_FIELDNAME` hatasını güvenli biçimde atladığı doğrulandı.
- Uygulama test paketi ve frontend build'i çalıştırıldı.

## Risks / open questions

- Migration bu çalışma ortamından canlı sunucuya uygulanmadı; sunucuda komutun çalıştırılması gerekir.
- Uygulama öncesi veritabanı yedeği alınmalı ve sonrasında iki sütun ile `ebys_batches` tablosu `SHOW` sorgularıyla doğrulanmalıdır.
