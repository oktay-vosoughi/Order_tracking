# UPDATE 2026-11-05 — Bölüm stok dağılımında süresi geçmiş lotlar da gösterilir

## Summary
- Stok listesinde "Moleküler Genetik: 0 / SİTOGENETİK: 133" gibi bölüm dağılımı, süresi geçmiş lotları saymıyordu; toplam (138) ise sayıyordu. Dağılım artık `pools[x].total` değerini gösterir (süresi geçmiş dahil). SKT uyarıları ayrı çalışmaya devam eder.
- Örnek: D200ST (F171301) MG'de SKT 2023-08-01 olan 5 kutu → artık "Moleküler Genetik: 5".

## Files touched
- `src/stockDisplay.mjs` (`getDepoPoolRows`: `available` alanı `total`'dan beslenir)

## DB changes
Yok.

## Rollback
`src/stockDisplay.mjs` içinde `pools[key]?.total ?? pools[key]?.available` ifadesini `pools[key]?.available` yapın.

## Test steps
1. `node --test src/stockDisplay.test.mjs`
2. Stok sayfasında D200ST: bölüm dağılımı MG 5 + SİTOGENETİK 133 = 138 göstermeli.

## Risks
Düşük. Yalnızca dağılım satırlarının gösterimi; stok hesabı, FEFO ve durum rozetleri değişmedi.
