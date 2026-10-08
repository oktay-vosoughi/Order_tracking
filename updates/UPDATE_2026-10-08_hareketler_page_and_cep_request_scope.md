# UPDATE 2026-10-08 — Hareketler sayfası ve CEP talep departman kapsamı

## Summary

- Yeni "Hareketler" sayfası: CEP DEPO genel stok hareketleri defteri CEP DEPO sayfasından buraya taşındı (lab teknisyeni kendi "Stok hareketlerim" görünümünü Günlük İşlerim içinde korur).
- `GET /api/purchases`: ADMIN, SATINAL_LOJISTIK, KURUMSAL, KALITE dışındaki roller artık yalnızca üyesi oldukları departmanların CEP DEPO taleplerini görür (ör. SİTOGENETİK kullanıcısı Moleküler Genetik/Mikro dağıtım taleplerini görmez). Normal satın alma talepleri etkilenmez.

## Files touched

- `server/index.js` — `/api/purchases` CEP talep departman filtresi.
- `src/CepMovementsTable.jsx` (yeni) — CepDepo'dan çıkarılan filtre + tablo.
- `src/Hareketler.jsx` (yeni) — sayfa.
- `src/CepDepo.jsx` — genel defter bölümü kaldırıldı, ortak bileşen kullanılıyor.
- `src/App.jsx` — menü öğesi, başlık ve sekme.

## DB changes

Yok. Rollback SQL gerekmez.

## Rollback

`git revert` ile commit'i geri alın; backend ve frontend'i yeniden başlatın.

## Test steps

- `node --check server/index.js`, `node --test server/*.test.cjs` (101/101), `npm run build` — geçti.
- Elle: SİTOGENETİK üyeliği olan SATINAL hesabıyla Dağıtım sekmesinde yalnızca SİTOGENETİK taleplerini görün; ADMIN hepsini görmeli. Hareketler menüsü lab teknisyeninde görünmemeli.

## Risks

- Tarayıcıda/canlı DB ile test edilmedi.
- `/api/cep-depo/movements`, `/balances` ve dağıtım/onay uçları değişmedi: SATINAL hâlâ tüm departmanların hareket ve bakiyelerini görür; sadece talep listesi daraltıldı.
- Hiç departman üyeliği olmayan SATINAL/OBSERVER CEP taleplerini görmez.

## Follow-up (same day): SATINAL departman kapsamı

- `getUserDepartments` artık yalnızca ADMIN, SATINAL_LOJISTIK, KURUMSAL, KALITE için `null` (filtresiz) döner; SATINAL üyelik kapsamına alındı. Etkilenen uçlar: `/api/cep-depo/balances|movements|distributions|consumptions|pending-confirmations`, `/api/purchases` CEP talepleri, ISO/MG form departman kontrolü.
- Rollback: `getUserDepartments` içinde `CROSS_DEPARTMENT_ROLES` yerine `isBypassRole(role)` kullanın.
- Risk: `/api/distributions`, `/api/waste-records`, `/api/distributions-detailed` listeleri hâlâ tüm roller için departman filtresizdir.
