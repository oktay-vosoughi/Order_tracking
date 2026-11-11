// Turns the `wms` block returned by POST /api/purchases into a user message.
// `wms` is null when the WMS module is off or the request is not a CEP DEPO one.

export function describeWmsResult(wms) {
  if (!wms) return null;
  if (wms.status === 'GONDERILDI') {
    const slip = wms.slipNumber ? ` (WMS fiş no: ${wms.slipNumber})` : '';
    return {
      type: 'success',
      text: wms.verified
        ? `Talep WMS'e iletildi ve WMS tarafında doğrulandı${slip}.`
        : `Talep WMS'e iletildi${slip}; WMS'te henüz doğrulanamadı, depo ekibiyle kontrol edin.`
    };
  }
  if (wms.status === 'ATLANDI') {
    return { type: 'info', text: wms.message || 'Talep zaten WMS\'e gönderilmiş.' };
  }
  return {
    type: 'error',
    text: `Talep kaydedildi ancak WMS'e iletilemedi: ${wms.message || 'bilinmeyen hata'}. Lojistik yeniden gönderebilir.`
  };
}
