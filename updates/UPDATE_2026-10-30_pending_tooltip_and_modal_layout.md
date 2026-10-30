# UPDATE 2026-10-30 — "Beklemede" ipucu, pencere yerleşimi, PDF-yok etiketi düzeltmesi

## Summary

- Stok listesinde "+N beklemede" üzerine gelince (hover) bekleyen miktarın hangi taleplerden geldiği görünür: Talep No, durum, bekleyen miktar (kısmi tesliminde "X'ten Y geldi") ve talep tarihi.
- `Malzeme Dağıt` ve `Malzeme Teslim Al` pencereleri: üstte sabit başlık, ortada kaydırılan içerik, altta sabit butonlar; alanlar iki sütun. Miktar ve Dağıt/Teslim Al butonu için kaydırma gerekmez. CEP DEPO talep listesi kendi içinde kaydırılır.
- `Talebi Onayla` ve `CEP DEPO Birim Ayarları` pencerelerine yükseklik sınırı + kaydırma eklendi (küçük ekranda taşıyordu).
- Önceki commit'te (`ffdedb9`) "PDF yok - Excel'den aktarıldı" etiketleri yanlış yerlere girmişti (başlıkta "kalem" altına, satırda "Miktar" altına); doğru yerlere taşındı.

## Files touched

- `server/index.js` (`GET /api/unified-stock`: `pendingDetails` kalem ve havuz bazında)
- `src/App.jsx`
- `src/stockDisplay.mjs`, `src/stockDisplay.test.mjs` (`formatPendingTooltip`)

## DB changes

Yok. Rollback: commit'i geri al (`git revert`).

## Test steps

1. `node --test src/stockDisplay.test.mjs`
2. Stok sekmesinde bekleyen miktarı olan bir kaleme gel: "+N beklemede" üzerinde ipucu görünmeli.
3. Bir kalem için Dağıt'a bas: Miktar/Departman/Alan Kişi ve Dağıt butonu kaydırmadan görünmeli (dizüstü ekranında dene).
4. Sipariş / Teslim Al sekmesinde Teslim Al'a bas: Gelen Miktar ve Teslim Al butonu görünmeli.

## Risks

- Hover ipucu dokunmatik ekranlarda çalışmaz (tarayıcı `title` özelliği).
- `pendingDetails` kalem başına bekleyen satır sayısı kadar veri ekler (yaklaşık 160 satır, ihmal edilebilir).
