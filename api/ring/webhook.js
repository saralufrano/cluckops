import { persistRingEvent } from '../../lib/ring-events.js';
import { isRedisConfigured } from '../../lib/redis-store.js';
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
  if (!isRedisConfigured()) return res.status(503).json({ error: 'Durable storage is not configured' });

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

  const summary = summarizeRingEvent(event);
  if (!summary.requestId) return res.status(400).json({ error: 'Missing Ring request_id' });

  try {
    const persisted = await persistRingEvent(summary);
    if (!persisted.duplicate) console.log('Persisted verified Ring webhook', summary);
    return res.status(200).json({ received: true, duplicate: persisted.duplicate });
  } catch (error) {
    console.error('Ring webhook persistence failed', { message: error?.message });
    // Non-2xx asks Ring to retry. Never acknowledge an event we failed to persist.
    return res.status(503).json({ error: 'Temporary persistence failure' });
  }
}
