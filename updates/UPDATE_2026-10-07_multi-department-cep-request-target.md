# UPDATE 2026-10-07 — Çok departmanlı CEP talep hedefi

## Summary

- Birden fazla departmana bağlı laboratuvar kullanıcısının talep sırasında seçtiği departman artık API'ye gönderilir ve talep üzerinde korunur.
- Talebe bağlı dağıtım, kullanıcının eski `users.department` ana alanı yerine talebin departmanına gider.
- Sunucu, seçilen talep departmanının hedef teknisyenin güncel departman üyeliklerinden biri olduğunu doğrular.
- Dağıtım ekranındaki LOT listesi talebin departmanına göre süzülür.

## Files touched

- `server/stockWriteScope.cjs`
- `server/index.js`
- `server/stockWriteScope.test.cjs`
- `src/api.js`
- `src/App.jsx`
- `src/CepDepo.jsx`
- Bu değişiklik kaydı.

## DB changes

- Şema ve mevcut veriler değişmez.
- Yeni taleplerde `purchases.department` kullanıcının açıkça seçtiği yetkili departmandır.
- CEP dağıtımı aynı departmanın LOT'undan düşer ve aynı departmanın `cep_depo_balances` kaydına eklenir.

## Rollback SQL

- Gerekmez. Uygulama kodu geri alınır.

## Test steps

- Çok departmanlı LAB_TECHNICIAN, üyeliklerinden birini talep hedefi olarak seçebilir.
- Üyesi olmadığı departmanı seçemez.
- Ana departmanı farklı olsa bile talep departmanına üye olan teknisyene bağlı dağıtım talep departmanının LOT ve CEP deposunu kullanır.
- Hedef teknisyen talep departmanının üyesi değilse dağıtım `DEPARTMENT_MISMATCH` ile reddedilir.
- `npm test`, `npm run build`, `node --check server/index.js` ve `git diff --check` çalıştırılır.

## Risks

- Eski talepler mevcut `purchases.department` değerini kullanmaya devam eder.
- Talep sırasında departman seçimi yalnızca kullanıcının güncel üyelikleriyle sınırlıdır; üyelik sonradan kaldırılırsa bekleyen dağıtım güvenli biçimde reddedilir.
