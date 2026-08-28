import crypto from 'node:crypto';

function timingSafeHexEqual(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function signatureCandidates(req) {
  return [
    req.headers['x-ring-signature'],
    req.headers['x-ring-signature-256'],
    req.headers['x-signature'],
    req.headers['x-hub-signature-256']
  ].filter(Boolean).map(String);
}

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.RING_HMAC_SECRET;
  if (!secret) return res.status(503).json({ error: 'Ring HMAC secret is not configured' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const signatures = signatureCandidates(req).map(value => value.replace(/^sha256=/i, ''));
  const verified = signatures.some(value => timingSafeHexEqual(value, expected));

  if (!verified) {
    console.warn('Rejected Ring webhook: signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // First live increment: prove a signed Ring event reached CluckOps.
  // Durable event persistence is intentionally the next slice.
  console.log('Verified Ring webhook', {
    requestId: event.request_id ?? event.requestId ?? null,
    eventType: event.event_type ?? event.type ?? 'unknown',
    deviceId: event.device_id ?? event.deviceId ?? null
  });

  return res.status(200).json({ received: true });
}
