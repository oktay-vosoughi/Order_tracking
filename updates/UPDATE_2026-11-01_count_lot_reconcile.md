# UPDATE 2026-11-01 — Sayım (LY-F064) lot uzlaştırma betiği

## Summary

- Excel içe aktarma lotları `LYF064-<kod>-<SKT>` adıyla eşler. Departmanın eski lotları farklı adlarla (kod, `MANUAL-...`, gerçek lot no) girilmişse içe aktarma onları güncellemez, yeni lot açar ve stok iki katına çıkar (Mikro'nun ilk sayımında karşılaşılan durum).
- `server/reconcileCountLots.cjs` sayım Excel'ini bir departmanın mevcut lotlarıyla SKT bazında eşleştirir:
  - aynı malzeme + departman + SKT → mevcut lotun miktarı sayıma eşitlenir, **lot numarası korunur**;
  - eşleşmeyen stoklu lot → sıfırlanır (`DEPLETED`);
  - eşleşmeyen sayım lotu → yeni `LYF064-...` lotu;
  - hem eşleşmeyen sayım lotu hem eşleşmeyen stoklu lot varsa → `MANUEL` (atlanır). `--force KOD` "eskiyi sıfırla, yeniyi aç" uygular; `--keep-lots KOD` ise sayıları eşitse bunları SKT sırasıyla eşleştirip yalnızca **miktarı** günceller (gerçek lot no ve SKT korunur, SKT farkı rapora `NOT` olarak yazılır).
- Varsayılan dry-run. `item_definitions` (ana veri) değiştirilmez; DB'de olmayan malzeme `ITEM_YOK` olarak raporlanır.

## Files touched

- `server/countReconcile.cjs` (saf planlama) + `server/countReconcile.test.cjs`
- `server/reconcileCountLots.cjs` (komut satırı)

## DB changes

Şema değişikliği yok. `--apply` yalnızca `lots` satırlarını günceller/ekler (`updatedBy`/`createdBy` = `count-reconcile`). Tek transaction.

## Run

```
node server/reconcileCountLots.cjs --xlsx "<sayim.xlsx>" --department "Moleküler Mikro" --report rapor.csv           # dry-run
node server/reconcileCountLots.cjs --xlsx "<sayim.xlsx>" --department "Moleküler Mikro" --force KOD1,KOD2 --keep-lots KOD3,KOD4 --apply    # uygula
```

## Rollback SQL

`--apply` sonunda `reconcile_rollback_<ts>.sql` (veya `--rollback` yolu) yazılır: güncellenen lotlar eski miktar/durumuna döner, eklenenler silinir. Ek olarak çalıştırmadan önce `mysqldump ... lots` alın.

## Test steps

1. `node --test server/countReconcile.test.cjs`
2. Dry-run, raporu Excel ile karşılaştır; `MANUEL` ve `ITEM_YOK` satırlarına karar ver.
3. `--apply` sonrası Genel Stok ekranında toplamları sayım formuyla karşılaştır.

## Risks

- Eşleşme yalnızca SKT'ye bakar; aynı SKT'de birden fazla stoklu lot varsa `MANUEL`.
- Sayımda olmayan ama stoku olan malzemelere dokunulmaz (raporda listelenir).
- Sayım birimi malzemenin prod birimiyle (kutu/reax) uyumlu olmalıdır; betik birim dönüşümü yapmaz.
