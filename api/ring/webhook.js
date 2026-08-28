import { summarizeRingEvent, verifyRingSignature } from '../../lib/ring-webhook.js';

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

  if (!verifyRingSignature(rawBody, req.headers['x-signature'], secret)) {
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
  console.log('Verified Ring webhook', summarizeRingEvent(event));

  return res.status(200).json({ received: true });
}
