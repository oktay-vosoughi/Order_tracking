# Dağıtım yetkilisi için CEP DEPO talep iptali (2026-11-16)

## Özet
Mehtap (SATINAL_LOJISTIK) ve diğer dağıtım yetkilileri (ADMIN / SATINAL / SATINAL_LOJISTIK), "Malzeme Dağıt" penceresindeki
CEP DEPO taleplerini yanlış veya kabul edilmeyen durumlarda iptal edebilir. Önceden yalnızca talebi açan
LAB_TECHNICIAN kendi bekleyen talebini iptal edebiliyordu.

## Dosyalar
- `server/index.js` — yeni `POST /api/purchases/:id/cancel-cep-request` (canDistribute + stockWriteScope)
- `src/api.js` — `cancelCepRequestAsDistributor`
- `server/stockWriteScope.cjs` — endpoint SATINAL_LOJISTIK için tüm departmanlarda serbest (Mehtap = SATINAL_LOJISTIK; SATINAL ve diğerleri departman üyeliğiyle sınırlı kalır)
- `CLAUDE.md` — §5 SATINAL_LOJISTIK yetki cümlesi güncellendi
- `src/App.jsx` — `handleCancelCepRequest` + talep satırında "İptal" butonu (`canDistribute`)

## Kurallar
- Yalnızca CEP DEPO talepleri; durum `TALEP_EDILDI` veya `ONAYLANDI`; `receivedQtyTotal = 0` (dağıtılmamış).
- Durum `IPTAL` olur, `rejectedBy/rejectedAt/rejectedDate/rejectionReason` yazılır. Stok'a dokunulmaz.
- Dağıtılmış (`TESLIM_ALINDI`) talepler iptal edilemez (stok hareketi geri alınmaz).

## DB değişikliği
Yok.

## Geri alma
Kod revert. Yanlışlıkla iptal edilen talep için:
`UPDATE purchases SET status='TALEP_EDILDI', rejectedBy=NULL, rejectedAt=NULL, rejectedDate=NULL, rejectionReason=NULL WHERE id='<id>';`

## Test
1. Mehtap ile giriş → Malzeme Dağıt → CEP DEPO Talepleri listesinde "İptal" → neden gir → talep listeden kalkar, durum IPTAL.
2. LAB_TECHNICIAN ile endpoint çağrısı 403 döner.
3. Dağıtılmış talep için 409 döner.

## Riskler
Sunucu restart gerekir (pm2) ve frontend yeniden build edilmelidir.
