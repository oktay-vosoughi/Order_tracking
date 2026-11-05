# UPDATE 2026-11-05 — Sipariş verilmiş talepler için "İptal" butonu

## Summary
- Satın Alma Talepleri'nde "Teslim Al" butonunun yanına "İptal" butonu eklendi. Sipariş verilip hiç gelmeyen talepler iptal edilebilir.
- Yetki: "Teslim Al" ile aynı (ADMIN, SATINAL_LOJISTIK, canReceive yetkisi olanlar); bölüm kuralları `stockWriteScope` ile aynı.
- Sadece `SIPARIS_VERILDI` ve hiç teslim alınmamış (`receivedQtyTotal = 0`) kayıtlar iptal edilir. `KISMI_TESLIM` kapsam dışı.
- Durum `IPTAL` olur; `rejectedBy/At/Date` ve `rejectionReason` ("Sipariş iptal edildi (teslim alınamadı)") doldurulur. Stok/lot/receipt'e dokunulmaz. Kayıt "beklemede" sayımından düşer.

## Files touched
- `server/index.js` (`POST /api/purchases/:id/cancel-order`)
- `server/stockWriteScope.cjs` (yol, SATINAL_LOJISTIK tüm bölümler listesine eklendi)
- `src/api.js` (`cancelOrderedPurchase`), `src/App.jsx` (`handleCancelOrder`, 3 yerde buton)

## DB changes
Yok.

## Rollback
Kod: commit'i geri al. Yanlışlıkla iptal edilen kayıt için:
```sql
UPDATE purchases SET status='SIPARIS_VERILDI', rejectedBy=NULL, rejectedAt=NULL, rejectedDate=NULL, rejectionReason=NULL WHERE id='<id>' AND status='IPTAL';
```

## Test steps
1. `node --test server/stockWriteScope.test.cjs`, `npx vite build` (geçti).
2. SIPARIS_VERILDI bir talepte "İptal" → onay → durum İptal, beklemede sayısı düşer.
3. Teslim alınmış/kısmi talepte buton görünmez; API 409 döner.

## Risks
Düşük. Yeni endpoint ve buton; mevcut akışlar değişmedi. İptal onayı tarayıcı `confirm` ile alınır.
