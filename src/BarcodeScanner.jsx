import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Tek bileşen, iki yakalama yöntemi:
// 1) USB/Bluetooth el okuyucu: klavye gibi yazar ve Enter gönderir → input yakalar.
// 2) Mobil kamera: ZXing ile çözümleme — yalnızca HTTPS (veya localhost) üzerinde çalışır.
export default function BarcodeScanner({ onScan, autoFocus = true, placeholder = 'Barkodu okutun veya yazın' }) {
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const controlsRef = useRef(null);

  const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const submit = (raw) => {
    const code = (raw != null ? raw : value).trim();
    if (!code) return;
    setValue('');
    onScan(code);
  };

  useEffect(() => {
    if (!cameraOpen) return undefined;
    const reader = new BrowserMultiFormatReader();
    let done = false;
    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
        controlsRef.current = controls;
        if (result && !done) {
          done = true;
          controls.stop();
          setCameraOpen(false);
          submit(result.getText());
        }
      })
      .catch((e) => {
        setCameraError('Kamera açılamadı: ' + (e && e.message ? e.message : 'bilinmeyen hata'));
        setCameraOpen(false);
      });
    return () => {
      done = true;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [cameraOpen]);

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 px-4 py-2 border rounded-lg font-mono"
        />
        {cameraSupported ? (
          <button
            type="button"
            onClick={() => { setCameraError(''); setCameraOpen((o) => !o); }}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg whitespace-nowrap"
          >
            {cameraOpen ? 'Kamerayı Kapat' : '📷 Kamerayla Tara'}
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Kamera erişimi için site HTTPS üzerinden açılmalıdır. USB okuyucu ve elle giriş çalışır."
            className="px-3 py-2 bg-gray-300 text-gray-500 rounded-lg whitespace-nowrap cursor-not-allowed"
          >
            📷 Kamera yok
          </button>
        )}
      </div>
      {cameraError && <p className="text-xs text-red-600 mt-1">{cameraError}</p>}
      {cameraOpen && (
        <video ref={videoRef} className="w-full mt-2 rounded-lg border" style={{ maxHeight: 280 }} muted playsInline />
      )}
    </div>
  );
}
