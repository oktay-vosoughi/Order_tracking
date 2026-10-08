# EBYS formu PDF makrosu — yenileme

`ModulPDF.bas` = `Medigen_SatınAlmaTalepFormu.xlsm` içindeki `SatıalmaFormuPDF` makrosunun yeni sürümü
(~1000 satır → ~250 satır). Buton atamasi bozulmasin diye sub adi aynen korundu.

## Ne yapar
- STF sayfa sayısını `Talep Form!A19`'dan okur (0–8), döngüyle ayarlar ve aktarır; ayarlar ve dosya adları eskisiyle aynı.
- Kayıt klasörü: Masaüstü (yönlendirilmiş dahil) → OneDrive Masaüstü → (yerelse) dosyanın klasörü → `%TEMP%`.
- Dosya adı: `Format(Date,"yymmdd")_Format(Time,"hhnn")`, `\ / : * ? " < > |` temizlenir, yol < 250 karakter.
- Hata olursa **hata no, adım, sayfa ve yolu** gösterir; `EnableEvents`, `ScreenUpdating`, `PrintCommunication` her zaman geri açılır.
- `PrintQuality=600` gibi yazıcıya bağlı ayarlar hata verse bile PDF'i engellemez.

## Kurulum (Excel, Alt+F11)
1. Orijinal `.xlsm` dosyasının yedeğini al.
2. `Module1` içinde `Sub SatıalmaFormuPDF()` satırını `Sub SatıalmaFormuPDF_ESKI()` yap (ya da sil).
3. File → Import File… → `ModulPDF.bas` (Windows'ta Türkçe kod sayfası ile, cp1254, hazırdır).
4. Debug → Compile VBAProject → hata olmamalı. Kaydet (.xlsm).

## Hücre formülleri (Talep Form) — TEXT() Türkçe kodları yerine

M2:
```
=$C$4&"_SatınAlmaTalepFormu_"&RIGHT(YEAR(TODAY()),2)&RIGHT("0"&MONTH(TODAY()),2)&RIGHT("0"&DAY(TODAY()),2)&"_"&RIGHT("0"&HOUR(NOW()),2)&RIGHT("0"&MINUTE(NOW()),2)
```
N2:
```
=$C$4&"_SatınAlmaÖnYazı_"&RIGHT(YEAR(TODAY()),2)&RIGHT("0"&MONTH(TODAY()),2)&RIGHT("0"&DAY(TODAY()),2)&"_"&RIGHT("0"&HOUR(NOW()),2)&RIGHT("0"&MINUTE(NOW()),2)
```
D13:
```
="Bugün : "&RIGHT("0"&DAY(TODAY()),2)&"/"&RIGHT("0"&MONTH(TODAY()),2)&"/"&YEAR(TODAY())
```
K2 (Talep No, gtmlims dosyada sabit değerle ezer):
```
=RIGHT(YEAR(NOW()),2)&RIGHT("0"&MONTH(NOW()),2)&RIGHT("0"&DAY(NOW()),2)&"-"&RIGHT("0"&HOUR(NOW()),2)&RIGHT("0"&MINUTE(NOW()),2)&RIGHT("0"&SECOND(NOW()),2)
```
Not: Yeni makro dosya adını kendisi kurduğu için M2/N2 yalnızca E1/F1 görünümü içindir.

## Doğrulanmadı
Bu makro macOS'ta derlenip çalıştırılamadı. Windows Excel'de önce boş bir kopyada, sonra gtmlims'ten inen gerçek dosyada deneyin.
