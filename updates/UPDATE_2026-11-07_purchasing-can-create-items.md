# UPDATE 2026-11-07 — Satın alma rolleri yeni malzeme tanımı ekleyebilir

## Summary
SATINAL ve SATINAL_LOJISTIK, departman üyeliği olmasa da `POST /api/item-definitions` ile
geçerli herhangi bir departmana yeni malzeme ekleyebilir. Önceden `stockWriteScope`
üyelik kontrolü (`user_departments`) yüzünden "departman seçin / yetkiniz yok" ile reddediliyordu.

## Admin switch
Hesabım → Sistem Ayarları → "Satın alma yeni malzeme ekleyebilsin" (ADMIN). `app_settings.purchasing_can_add_items`
('0' = kapalı; satır yoksa açık). Kapalıyken eski üyelik kuralı geçerli.

## Files touched
- server/stockWriteScope.cjs, server/stockWriteScope.test.cjs, server/index.js (getSetting geçirildi), src/App.jsx

## DB changes
Yok (app_settings satırı ilk kapatma/açmada oluşur).

## Rollback
`git revert <commit>`.

## Test steps
`npm test`; satın alma kullanıcısı ile Stok → Malzeme Ekle → herhangi bir bölüm seçip kaydet.

## Risks
Ortak (isGlobal) malzeme yine yalnızca admin; mevcut malzemeyi düzenleme ve Excel içe aktarma kuralları değişmedi.
