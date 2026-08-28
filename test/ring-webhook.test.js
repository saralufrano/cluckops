import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { summarizeRingEvent, verifyRingSignature } from '../lib/ring-webhook.js';

const secret = 'test-secret';
const payload = Buffer.from(JSON.stringify({
  meta: {
    version: '1.1',
    request_id: 'req-123',
    account_id: 'acct-456'
  },
  data: {
    type: 'motion_detected',
    attributes: {
      source: 'device-789',
      timestamp: 1770989995231
    }
  }
}));

function sign(body, key = secret) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

test('accepts a valid Ring X-Signature', () => {
  assert.equal(verifyRingSignature(payload, sign(payload), secret), true);
});

test('accepts sha256= prefixed signatures', () => {
  assert.equal(verifyRingSignature(payload, `sha256=${sign(payload)}`, secret), true);
});

test('rejects a changed body', () => {
  const changed = Buffer.from(`${payload.toString('utf8')} `);
  assert.equal(verifyRingSignature(changed, sign(payload), secret), false);
});

test('rejects the wrong secret', () => {
  assert.equal(verifyRingSignature(payload, sign(payload, 'wrong-secret'), secret), false);
});

test('rejects missing signature or secret', () => {
  assert.equal(verifyRingSignature(payload, '', secret), false);
  assert.equal(verifyRingSignature(payload, sign(payload), ''), false);
});

test('maps Ring v1.1 fields without parsing opaque event ids', () => {
  const event = JSON.parse(payload.toString('utf8'));
  assert.deepEqual(summarizeRingEvent(event), {
    requestId: 'req-123',
    accountId: 'acct-456',
    eventType: 'motion_detected',
    deviceId: 'device-789',
    timestamp: 1770989995231
  });
});
