import crypto from 'node:crypto';

function encryptionKey(env = process.env) {
  const encoded = env.RING_TOKEN_ENCRYPTION_KEY || '';
  if (!encoded) throw new Error('Ring token encryption key is not configured');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Ring token encryption key must decode to exactly 32 bytes');
  return key;
}

export function encryptSecret(value, { env = process.env, randomBytes = crypto.randomBytes } = {}) {
  if (!value) throw new Error('Cannot encrypt an empty secret');
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(envelope, { env = process.env } = {}) {
  const [version, ivText, tagText, ciphertextText, extra] = String(envelope || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new Error('Invalid encrypted secret envelope');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}
