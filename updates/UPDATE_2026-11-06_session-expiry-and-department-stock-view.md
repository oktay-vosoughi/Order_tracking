# UPDATE 2026-11-06 — Oturum süresi dolunca girişe dön, bölüm bazlı stok gösterimi

## Summary
- 401 (UNAUTHORIZED) gelince eski token silinir, uygulama giriş ekranına döner (talep oluştururken "UNAUTHORIZED" hatası sebebi: süresi dolmuş/geçersiz token).
- Stok sayfasında bölüm filtresi seçiliyken (ör. Moleküler Genetik) Depo sütunu o bölümün kendi miktarını gösterir; ortak havuz toplamı (MG + Mikro) küçük notla gösterilir. Dağıt/FEFO ortak havuz mantığı DEĞİŞMEDİ.
- Talep formunda bölüm, stok sayfasında filtre seçiliyse o bölüme öntanımlı gelir.

## Files touched
- src/api.js (apiFetch 401 → `auth:expired` olayı)
- src/App.jsx (olay dinleyici, deptView, openPurchaseRequestForm)
- src/stockDisplay.mjs (getDepartmentStockView)

## DB changes
Yok.

## Rollback
`git revert <commit>`; DB işlemi gerekmez.

## Test steps
1. Geçersiz token ile talep oluştur → giriş ekranına döner, "Oturum süreniz doldu" mesajı.
2. Stok → Moleküler Genetik filtresi → D4068 Depo 1 Kutu, "Ortak havuz toplamı: 6".
3. Filtre seçiliyken Talep → bölüm Moleküler Genetik gelir.

## Risks
Düşük; yalnızca görüntüleme ve istemci tarafı oturum işleme. Ekranda gösterilen miktar ile Dağıt'ın kullanabildiği ortak miktar farklı olabilir (bilinçli).
