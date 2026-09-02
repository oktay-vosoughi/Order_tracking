# UPDATE 2026-08-31 — Satın Alma ve EBYS görev merkezi

## Summary
- SATINAL ve SATINAL_LOJISTIK kullanıcıları artık girişten sonra doğrudan rol bazlı satın alma/EBYS görev merkezine gelir.
- Yeni satın alma talebi iki kısa adıma indirildi; EBYS hazırlama, dış onay, mal kabul ve dağıtım işleri büyük görev düğmeleriyle ayrıldı.
- EBYS paket onayındaki tarayıcı `prompt` pencereleri kaldırıldı; Talep No, paket kalem sayısı, tedarikçi ve PO bilgisi tek güvenli pencerede birleştirildi.
- Aynı EBYS formuna bağlı talepler tek paket kartında gruplanır; karta tıklanınca paketin kalemleri açılır ve dış onay paket başlığından verilir.
- SATINAL_LOJISTIK ekranı kullanım sırasına göre üç ana işe indirildi: Mal Dağıtımı, EBYS Sonrası Onay ve Mal Teslim Al. Yeni talep, form hazırlama ve tüm kayıtlar kapalı `Diğer işlemler` alanına taşındı.
- Lojistik kullanıcısı girişte kayıt tablosu yerine yalnız üç ana görevi görür; görev seçilince ilgili liste açılır. Masaüstü ve mobil menüde Dağıtım, EBYS İşleri ve Mal Kabul'den önce gelir.

## Scope / project
- Order tracking projesi; React arayüzü, satın alma görünüm yardımcıları, testler ve rol eğitim dokümanları.

## Files touched
- `src/App.jsx` — rol bazlı varsayılan sayfa, satın alma görev merkezi, iki adımlı talep, yönlendirilmiş EBYS ve dış onay penceresi.
- `src/theme.css` — responsive görev kartları, modal, seçim ve erişilebilir hareket stilleri.
- `src/mobileUi.mjs` — EBYS hazırlama, dış onay, mal kabul ve tamamlanan kayıt sayaç/filtre yardımcıları.
- `src/mobileUi.test.mjs` — görev sayaçları ve hızlı görünüm testleri.
- `docs/training/README.md` — rol matrisi ve yeni görev merkezi envanteri.
- `docs/training/roles/02-satinal.md` — yeni talep ve EBYS eğitim akışı.
- `docs/training/roles/03-satinal-lojistik.md` — görev merkezi, dış EBYS onayı ve mal kabul akışı.

## DB changes (if any)
- Veritabanı veya migration değişikliği yoktur.
- Rollback SQL: gerekli değildir.

## How to revert
1. Bu güncellemede eklenen `src/App.jsx`, `src/theme.css`, `src/mobileUi.mjs`, `src/mobileUi.test.mjs` değişikliklerini geri alın.
2. İki rol eğitim dosyasını ve `docs/training/README.md` değişikliklerini geri alın.
3. Bu değişiklik kaydını silmek yerine geri alma için ayrı bir `UPDATE_<date>_revert_purchase_ebys_task_center.md` kaydı ekleyin.
4. `npm test` ve `npm run build` çalıştırın; SATINAL girişinin yeniden Stok sayfasına döndüğünü ve eski EBYS `prompt` akışının geri geldiğini doğrulayın.

## Test steps performed
- `npm test` — 99/99 test geçti.
- `npm run build` — başarılı; yalnız mevcut büyük chunk uyarısı devam ediyor.
- `git diff --check` — başarılı.
- Motion taraması — `transition: all`, `ease-in`, `scale(0)` ve yeni keyframe animasyonu bulunmadı.
- Yerel API/MySQL bağlantısı doğrulandı; API zaten `:4000` portunda çalışıyordu.

## Risks / open questions
- Bu oturumda bağlı bir tarayıcı olmadığı için yeni masaüstü ve telefon görünümleri üzerinden ekran görüntülü piksel kontrolü yapılamadı.
- Dış EBYS yüklemesi kurumun ayrı sisteminde manuel kalır; GTMLIMS yalnız resmi formu üretir ve dış onay sonucunu kaydeder.
- Sunucu endpointleri, rol middleware'leri, durum sabitleri ve veritabanı şeması değiştirilmedi.
