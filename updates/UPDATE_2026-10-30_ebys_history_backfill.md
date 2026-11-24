# UPDATE 2026-10-30 — Geçiş öncesi EBYS taleplerinin yüklenmesi (backfill)

## Summary

- 2026'da EBYS'ye girilmiş 32 talep (PDF formlar) + PDF'i olmayan 5 adet 2026 talebi, `Moleküler Genetik` departmanı için `purchases` olarak yüklenir.
- Geliş bilgisi MG-F069 Excel'inden (`2026` sayfası) alınır. Excel'de her satır bir birimdir; gelen miktar = satırların `Gelen Miktar` toplamı.
- Durum: gelen >= talep → `TESLIM_ALINDI`; 0 < gelen < talep → `KISMI_TESLIM`; gelmemiş → `SIPARIS_VERILDI` (EBYS onaylı, beklemede).
- Lot no (birden fazlaysa ` / ` ile birleşik), geliş tarihi (en erken), SKT (en erken), firma, teslim alan Excel'den yazılır.
- **Stok / lot oluşturulmaz.** Mevcut stok LY-F064 ile zaten yüklü; teslimler yalnızca talep geçmişidir.
- Tüm PDF kalemleri yüklenir. Excel'de gelen miktar yerine `İhale` yazan kalemler `SIPARIS_VERILDI` (beklemede) yüklenir; gelen bilgisi yazılmaz.
- Sistemde tanımı olmayan kalemler için `item_definitions` kaydı otomatik açılır (`notes` `[EBYS-GECIS]` ile başlar, departman `Moleküler Genetik`). `GECIS-…` ile başlayan kodlar geçicidir, uygulamadan düzeltilebilir.
- Dry-run sonunda `EKSİK / KONTROL ET` listesi çıkar: PDF kalem sayısı ile yüklenecek sayı farkı, PDF'te olmayan Excel kalemleri, geçersiz geliş tarihleri.
- Kapsam dışı: 2025 sayfası, ihaleler, `Moleküler Mikro`.

## Files touched

- `server/ebysHistoryBackfill.cjs` (saf planlama mantığı) + `server/ebysHistoryBackfill.test.cjs`
- `server/backfillEbysHistory.cjs` (komut satırı; varsayılan dry-run)
- `server/data/ebys-history-pdfs.json` (PDF'lerden çıkarılan talep kalemleri)

## DB changes

Şema değişikliği yok. Veri: `item_definitions` (otomatik açılan kalemler), `ebys_batches` (`id = GECIS-<TalepNo>`) ve `purchases` (`requestNumber = GECIS-<TalepNo>-NN`, `notes` `[EBYS-GECIS]` ile başlar). Zaten var olan Talep No'lar atlanır.

## Run

```
node server/backfillEbysHistory.cjs --xlsx "<MG-F069.xlsx>" --report rapor.csv           # dry-run
node server/backfillEbysHistory.cjs --xlsx "<MG-F069.xlsx>" --overrides map.json --apply  # yükle
```

## Rollback SQL

```sql
DELETE FROM purchases WHERE notes LIKE '[EBYS-GECIS]%' AND requestNumber LIKE 'GECIS-%';
DELETE FROM ebys_batches WHERE id LIKE 'GECIS-%';
DELETE FROM item_definitions WHERE notes LIKE '[EBYS-GECIS]%' AND id NOT IN (SELECT itemId FROM purchases);
```

## Test steps

1. `node --test server/ebysHistoryBackfill.test.cjs`
2. Dry-run çalıştırıp raporu Excel ile karşılaştır.
3. `--apply` sonrası Satın Alma Talepleri ekranında Talep No ile ara; MG-F069 dışa aktarımında durumların "Tamamlandı / Kısmen Geldi / Sipariş Verildi" olduğunu kontrol et.

## Risks

- Aynı kalem için birden fazla lot tek satırda birleşik yazılır.
- Excel'de geçersiz tarih (ör. 3036) varsa geliş tarihi boş kalır (raporda `GELIS_TARIHI_GECERSIZ`).
- Tekrar çalıştırma talep bazında atlar: kısmi yüklemeden sonra eksik kalem eklemek için önce rollback gerekir. Kalem tanımlarını `--apply` öncesi tamamlayın.
