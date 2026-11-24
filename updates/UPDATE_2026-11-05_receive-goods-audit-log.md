# UPDATE 2026-11-05 — Teslim alma logu (kim, ne zaman)

## Summary
- `POST /api/receive-goods` artık her teslim alma için `stock_movements` tablosuna `RECEIVE_GOODS` satırı yazar (aynı transaction içinde): oturum açan kullanıcı, zaman, miktar, bölüm, talep no, lot, SKT. Forma elle yazılan "Teslim Alan" adı farklıysa notta tutulur.
- Hareketler sayfasında "Teslim Alma" (Tedarikçi → Ana Depo) olarak görünür.
- `receipts` tablosu ve stok hesapları değişmedi.

## Files touched
- `server/index.js` (receive-goods), `src/CepMovementsTable.jsx` (etiketler), `src/Hareketler.jsx` (başlık)

## DB changes
Şema değişikliği yok. Yeni satırlar `stock_movements`'e `movementType='RECEIVE_GOODS'` ile eklenir.

## Rollback
```sql
DELETE FROM stock_movements WHERE movementType = 'RECEIVE_GOODS';
```
Kod: commit'i geri al.

## Test steps
1. Bir siparişi Teslim Al ile teslim al → Hareketler'de "Teslim Alma" satırı, işlemi yapan = giriş yapan kullanıcı.
2. Kısmi teslimde her teslim ayrı satır olur.

## Risks
Düşük. Aynı transaction'da tek INSERT; hata olursa teslim alma da geri alınır. Geçmiş teslimler (bu güncellemeden önce) logda yoktur; kim/ne zaman bilgisi `receipts` tablosunda durur.
