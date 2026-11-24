# Stok kartında çoklu tedarikçi (2026-11-24)

## Özet
Aynı malzeme kodu için birden fazla tedarikçi varsa stok kartında "Tedarikçi (N)" rozeti gösterilir; üzerine gelince (masaüstü, title) ya da kartı açınca (mobil) tüm isimler listelenir. Tek tedarikçi varsa adı doğrudan görünür.

## Dosyalar
- server/index.js — `/api/unified-stock` yanıtına `suppliers` dizisi (item_definitions.supplier + purchases.supplierName + receipts.supplierFirmName, tekilleştirilmiş); `mergeSupplierNames` yardımcısı
- src/stockDisplay.mjs (+ test) — `getItemSuppliers`, `getSupplierLabel`
- src/App.jsx — masaüstü tablo rozeti, mobil kart satırı ve detay alanı

## DB değişikliği
Yok (yalnızca okuma sorgusu).

## Rollback
Kod geri alınır; SQL gerekmez.

## Test adımları
1. `node --test src/stockDisplay.test.mjs`
2. Aynı koda iki farklı firmayla sipariş/teslim girin; Stok listesinde rozetin "Tedarikçi (2)" olduğunu ve hover'da iki ismin göründüğünü doğrulayın.

## Riskler
Tedarikçi listesi departman filtresine (purchaseFilter) tabidir; kullanıcı yalnızca kendi departmanındaki siparişlerin tedarikçilerini görür. Yeni sorgu canlı DB'de henüz çalıştırılmadı.
