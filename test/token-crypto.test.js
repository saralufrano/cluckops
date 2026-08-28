import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret } from '../lib/token-crypto.js';

const env = { RING_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

test('Ring secrets round-trip through AES-256-GCM', () => {
  const encrypted = encryptSecret('refresh-token-chicken', { env });
  assert.notEqual(encrypted, 'refresh-token-chicken');
  assert.equal(decryptSecret(encrypted, { env }), 'refresh-token-chicken');
});

test('same token encrypts differently each time', () => {
  assert.notEqual(encryptSecret('same', { env }), encryptSecret('same', { env }));
});

test('tampering is rejected', () => {
  const encrypted = encryptSecret('secret', { env });
  const parts = encrypted.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptSecret(parts.join('.'), { env }));
});

test('missing or malformed encryption key fails closed', () => {
  assert.throws(() => encryptSecret('secret', { env: {} }), /not configured/);
  assert.throws(() => encryptSecret('secret', { env: { RING_TOKEN_ENCRYPTION_KEY: Buffer.alloc(8).toString('base64') } }), /32 bytes/);
});
