# UPDATE 2026-10-07 — EBYS formunu tekrar indirme

## Summary

- Oluşturulmuş bir EBYS paketine “Formu Tekrar İndir” işlemi eklendi.
- Yeniden indirme aynı `ebysBatchId` ve aynı `ebysReference` (Talep No) ile resmi makrolu formu tekrar üretir; yeni paket veya Talep No oluşturmaz.
- Paket dış EBYS onayından sonra sipariş/teslim aşamasına geçmiş olsa da form yeniden indirilebilir.
- Form satırları ilk üretimde olduğu gibi kategori ve malzeme adına göre alfabetik sıralanır; eşitlikte ürün kayıt kimliği sabit sıra sağlar.

## Files touched

- `server/index.js`
- `server/ebysBatchPolicy.cjs`
- `server/ebysBatchPolicy.test.cjs`
- `src/api.js`
- `src/App.jsx`
- `src/theme.css`
- Bu değişiklik kaydı.

## DB changes

- Şema veya veri değişikliği yoktur.
- Yeni endpoint: `GET /api/export/talep-ebys-batches/:batchId/download`.

## Rollback SQL

- Gerekmez. Uygulama kodu geri alınır.

## Test steps

- EBYS paket kartındaki “Formu Tekrar İndir” düğmesi aynı Talep No ile `.xlsm` indirmelidir.
- Yeniden indirme sonrasında yeni `ebys_batches` veya yeni Talep No oluşmamalıdır.
- EBYS onayı verilmiş bir paket de yeniden indirilebilmelidir.
- Eksik paket 404, birden fazla Talep No içeren bozuk paket 409 vermelidir.
- `npm test`, `npm run build`, `node --check server/index.js` ve `git diff --check` çalıştırılır.

## Risks

- Form veritabanındaki mevcut ürün adı, kategori, birim ve talep miktarından yeniden üretilir. Bu alanlardan biri paket oluşturulduktan sonra yönetici tarafından değiştirilirse yeniden indirilen form güncel değeri gösterir.
