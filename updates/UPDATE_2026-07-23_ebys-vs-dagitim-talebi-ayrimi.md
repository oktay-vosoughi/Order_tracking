# UPDATE_2026-07-23_ebys-vs-dagitim-talebi-ayrimi

## Özet
Stok tablosunda (mobil kart + masaüstü tablo) bekleyen talep göstergesi, talebin gerçek satın alma mı yoksa CEP DEPO iç dağıtım talebi mi olduğuna göre iki ayrı etikete bölündü:

- **"EBYS beklemede"** (sarı/turuncu) — sadece SATINAL / SATINAL_LOJISTIK / ADMIN tarafından oluşturulmuş, henüz `SIPARIS_VERILDI` aşamasına geçmemiş (`TALEP_EDILDI` veya `ONAYLANDI`) gerçek satın alma talepleri için gösterilir.
- **"Dağıtım talebi"** (mavi) — LAB_TECHNICIAN tarafından (veya onun adına ADMIN/SATINAL tarafından) oluşturulmuş, henüz karşılanmamış CEP DEPO talepleri için gösterilir. EBYS ile hiçbir ilgisi yoktur.

Önceden ikisi de aynı koşulla ("herhangi bir `TALEP_EDILDI`/`ONAYLANDI` kaydı var mı") tetiklenip tek bir "EBYS beklemede" yazısı altında karışıyordu; bu yanlış bilgi veriyordu (bir lab teknikeri CEP DEPO'dan malzeme istediğinde bile "EBYS beklemede" görünüyordu).

Ayrımın kaynağı sunucu tarafında zaten mevcuttu (`server/index.js:2386-2462`): istek LAB_TECHNICIAN'dan geliyorsa veya bir LAB_TECHNICIAN adına açılıyorsa `isCepDepoRequest=1` yazılıyor; SATINAL/SATINAL_LOJISTIK/ADMIN kendi adına açtığında `isCepDepoRequest=0` kalıyor. Frontend bu bayrağı hiç kullanmıyordu; artık kullanıyor.

## Dosyalar
- `src/App.jsx` — mobil kart (`~satır 2899, 3092-3093`) ve masaüstü tablo (`~satır 3125-3126, 3199-3200`):
  - `pending` hesaplaması artık `!h.isCepDepoRequest && !h.requestedFor` filtresi ekliyor (sadece gerçek satın alma).
  - Masaüstü tabloya, mobilde zaten var olan `pendingCepRequestsByItem` tabanlı `pendingCepCount` değişkeni eklendi.
  - Her iki görünüme de `pendingCepCount > 0` olduğunda "Dağıtım talebi" (birden fazlaysa sayısıyla) etiketi eklendi.

## DB değişikliği
Yok. Sadece frontend render mantığı; `isCepDepoRequest`/`requestedFor` kolonları zaten mevcuttu ve API zaten dönüyordu.

## Rollback
`git revert` ile `src/App.jsx`'teki bu diffi geri almak yeterli; şema/veri etkisi yok.

## Test adımları
1. `npx vite build` — hatasız derlendi (doğrulandı).
2. Yerel test DB'sinde canlı örnek: `2.0 ml microcentrifuge tube` kalemi `TALEP_EDILDI`, `requestedBy='Oktay'` (rol=ADMIN, `isCepDepoRequest=0`) → yeni mantıkla hâlâ doğru şekilde "EBYS beklemede" gösterecek (doğrulandı, DB sorgusuyla).
3. Canlı bir LAB_TECHNICIAN kaynaklı bekleyen CEP DEPO talebi test DB'sinde şu an yok; "Dağıtım talebi" dalı kod okuma + sunucu mantığı üzerinden doğrulandı, tarayıcıda görsel olarak henüz teyit edilmedi (giriş bilgisi gerekiyor).

## Riskler
Düşük — sadece iki metin/koşul render bloğu değişti, mevcut "Dağıt" butonundaki CEP DEPO sayaç rozeti (`pendingCepRequestsByItem`) değişmedi.
