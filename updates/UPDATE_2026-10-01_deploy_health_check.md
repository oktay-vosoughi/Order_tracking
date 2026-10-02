# UPDATE 2026-10-01 — Deploy sağlık kontrolü

## Summary
`scripts/deploy.sh`, Apache 503 döndürdüğünde bile başarılı dağıtım mesajı yazıyordu. Yeni kontrol HTTP hatalarını reddeder, API'nin `{"status":"ok"}` JSON yanıtını doğrular ve başlangıç için 12 kez dener. Başarısızsa backend loglarını gösterir ve çıkış kodu 1 döndürür.

## Scope / project
Order_tracking, dağıtım betiği. API başlangıcı veritabanı hazırlığını bekler, PM2 online durumu tek başına portun açıldığı anlamına gelmez.

## Files touched
- `scripts/deploy.sh`
- Bu değişiklik kaydı.

## DB changes
Yok. Rollback SQL gerekmez.

## How to revert
`scripts/deploy.sh` sağlık kontrolünü önceki `sleep 2` ve tek curl çağrısına döndürün, ek hata/JSON denetimini kaldırın.

## Test steps performed
- `bash -n scripts/deploy.sh`.
- Sağlık kontrolü bloğu sahte curl/PM2 komutlarıyla sınandı: hemen başarı (1 deneme), iki 503 sonrası başarı (3 deneme), kalıcı 503, HTTP 200 ile HTML, yanlış durumlu JSON ve boş yanıt (her biri 12 deneme ve çıkış kodu 1). Altı kontrol geçti, başarısız durumda `Deploy complete!` yazılmadığı doğrulandı.

## Risks / open questions
- Canlı sunucuya erişim yok, deploy çalıştırılmadı. Kalıcı 503 için backend logları, dinlenen port ve Apache ProxyPass kontrolü gerekiyor.
- Mevcut betikteki `-k` TLS davranışı korunmuştur. Her istek en fazla 3 saniye, denemeler arası bekleme 2 saniye; toplam sağlık kontrolü yaklaşık 58 saniyeyle sınırlıdır.
