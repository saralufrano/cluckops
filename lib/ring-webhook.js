import crypto from 'node:crypto';

export function timingSafeHexEqual(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyRingSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const received = String(signatureHeader).replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeHexEqual(received, expected);
}

export function summarizeRingEvent(event) {
  return {
    requestId: event?.meta?.request_id ?? null,
    accountId: event?.meta?.account_id ?? null,
    eventType: event?.data?.type ?? 'unknown',
    deviceId: event?.data?.attributes?.source ?? null,
    timestamp: event?.data?.attributes?.timestamp ?? null
  };
}
