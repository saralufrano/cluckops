import crypto from 'node:crypto';

const NONCE_WINDOW_MS = 10 * 60 * 1000;

function hmacSecret(env = process.env) {
  const secret = env.RING_HMAC_SECRET || '';
  if (!secret) throw new Error('Ring HMAC secret is not configured');
  return secret;
}

export function validateRingLinkTime(timeValue, now = Date.now()) {
  const timeMs = Number(timeValue);
  if (!Number.isFinite(timeMs)) throw new Error('Invalid Ring link timestamp');
  const age = now - timeMs;
  if (age < 0) throw new Error('Ring link timestamp cannot be in the future');
  if (age > NONCE_WINDOW_MS) throw new Error('Ring link request expired');
  return timeMs;
}

export function computeRingLinkNonce(timeValue, accountId, { env = process.env } = {}) {
  if (!accountId) throw new Error('Missing Ring account ID');
  const timeMs = String(timeValue);
  const digest = crypto.createHmac('sha256', hmacSecret(env))
    .update(`${timeMs}:${accountId}`, 'utf8')
    .digest('base64url');
  return digest;
}

function timingSafeStringEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function matchRingLinkNonce({ nonce, time, tokenRecords, now = Date.now() }, options = {}) {
  if (!nonce) throw new Error('Missing Ring account-link nonce');
  validateRingLinkTime(time, now);
  for (const record of tokenRecords || []) {
    if (!record?.accountId || record.status !== 'unclaimed') continue;
    const expected = computeRingLinkNonce(time, record.accountId, options);
    if (timingSafeStringEqual(expected, nonce)) return record;
  }
  return null;
}
