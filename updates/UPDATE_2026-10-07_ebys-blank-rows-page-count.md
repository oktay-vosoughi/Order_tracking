# UPDATE 2026-10-07 — EBYS formu boş satırları doldurmuyor

## Summary

- `populateMedipolWorkbook` şablondaki 343 satırın tamamına `Genel Ürün` yazıyordu; boş satırlar da dolu görünüyordu.
- Formdaki `A19` (sayfa sayısı) `COUNTIF(B20:B362,"")` ile boş satırları sayar. Hepsi dolu olunca `A19 = 8` çıkıyor, `SatıalmaFormuPDF` makrosu 8 STF sayfası + TalepÖzet'i tek PDF olarak dışa aktarmaya çalışıyordu ve `ExportAsFixedFormat` 1004 hatası veriyordu. `M1` mesajı da her zaman "343 farklı ürün" diyordu.
- Artık yalnızca gerçek ürün satırları yazılır; kullanılmayan satırlar şablondaki gibi boş kalır.

## Files touched

- `server/ebysWorkbook.cjs`
- `server/ebysWorkbook.test.cjs`
- Bu değişiklik kaydı.

## DB changes

- Yok.

## Rollback SQL

- Gerekmez. `for` döngüsünü `index < MAX_REQUEST_LINES` olarak geri al.

## Test steps

- `node --test server/ebysWorkbook.test.cjs`
- 3 ürünlü bir paket için `.xlsm` indir, Excel'de aç: `Talep Form!A19` = 1 olmalı, `M1` "3 farklı Ürün/Hizmet" demeli.
- "PDF" düğmesi Masaüstüne Ön Yazı + 1 sayfa form kaydetmeli.

## Risks

- Excel'de gerçek makro çalıştırması bu ortamda (macOS) doğrulanamadı; `A19` formülünden çıkarılan sonuçtur.
- Dosya internetten indirildiği için Excel Korumalı Görünüm / "Düzenlemeyi Etkinleştir" ve makro engeli ayrıca geçerlidir (kod değişikliği değil, dosya Özellikler → Engellemeyi Kaldır).
