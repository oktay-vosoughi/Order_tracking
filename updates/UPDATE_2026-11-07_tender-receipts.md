# UPDATE 2026-11-07 — İhale Girişi (talepsiz doğrudan mal kabul)

## Summary
İhale ile gelen malzemeler satın alma talebi açılmadığı için sisteme girilemiyordu. Yeni "İhale Girişi"
sekmesi (yalnızca ADMIN ve SATINAL_LOJISTIK): malzeme, bölüm, miktar, LOT, SKT zorunlu; ihale no, firma,
fatura/irsaliye no, birim fiyat, ek dosya (≤3 MB), not isteğe bağlı. Kayıt doğrudan seçilen bölümün
LOT stoğuna eklenir (aynı malzeme+LOT varsa miktar artar; başka bölümün LOT'u ise 409). Liste, ihale no /
bölüm filtresi ve Excel dışa aktarma aynı sekmede. Satın alma kayıtları/sayaçları etkilenmez.

## Files touched
- server/tenderReceipts.cjs (+ .test.cjs), server/index.js (require, register, tablo oluşturma)
- src/TenderReceipts.jsx, src/api.js, src/App.jsx (sekme + menü)

## DB changes
Yeni tablo `tender_receipts` (başlangıçta `CREATE TABLE IF NOT EXISTS`). `lots` (purchaseId NULL, receiptId = ihale kaydı id)
ve `stock_movements` (RECEIVE_GOODS, not: "İhale <no>") satırları oluşur.

## Rollback
`git revert <commit>`. Kayıtları geri almak için: ilgili `lots` satırlarının miktarı düşürülmeli;
`DROP TABLE tender_receipts;` yalnızca kayıt listesini siler, stok düzeltmesi gerektirir.

## Test steps
1. Admin/Lojistik ile İhale Girişi → malzeme ara, bölüm/miktar/LOT/SKT gir → Stoğa Ekle; Stok sayfasında bölüm miktarı artar.
2. Zorunlu alanlardan biri boşken kayıt reddedilir. SATINAL/LAB_TECHNICIAN menüde sekmeyi görmez, API 403 verir.
3. Listeyi ihale no ile filtrele, Excel indir.

## Risks
Fiyat geçmişi (receipts tablosu) ihale girişlerini içermez; birim fiyat yalnızca tender_receipts'te tutulur.
Hatalı girişi düzeltmek/silmek için arayüz yok (stok düzeltme akışı kullanılmalı).
