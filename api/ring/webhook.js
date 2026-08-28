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

  const received = String(req.headers['x-signature'] || '').replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  if (!received || !timingSafeHexEqual(received, expected)) {
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
  // Durable request_id dedupe and event persistence are the next slice.
  console.log('Verified Ring webhook', {
    requestId: event.meta?.request_id ?? null,
    accountId: event.meta?.account_id ?? null,
    eventType: event.data?.type ?? 'unknown',
    deviceId: event.data?.attributes?.source ?? null,
    timestamp: event.data?.attributes?.timestamp ?? null
  });

  return res.status(200).json({ received: true });
}
