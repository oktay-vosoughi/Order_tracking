import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWmsResult } from './wmsFeedback.mjs';

test('no WMS block means no extra message', () => {
  assert.equal(describeWmsResult(null), null);
  assert.equal(describeWmsResult(undefined), null);
});

test('sent and verified request names the WMS slip', () => {
  const r = describeWmsResult({ status: 'GONDERILDI', slipNumber: '261015000001', verified: true });
  assert.equal(r.type, 'success');
  assert.match(r.text, /doğrulandı/);
  assert.match(r.text, /261015000001/);
});

test('sent but unverified request is a success that asks for a check', () => {
  const r = describeWmsResult({ status: 'GONDERILDI', slipNumber: null, verified: false });
  assert.equal(r.type, 'success');
  assert.match(r.text, /kontrol edin/);
});

test('failure keeps the request saved and shows the reason', () => {
  const r = describeWmsResult({ status: 'HATA', message: 'WMS\'e ulaşılamadı (zaman aşımı).' });
  assert.equal(r.type, 'error');
  assert.match(r.text, /kaydedildi/);
  assert.match(r.text, /zaman aşımı/);
});
