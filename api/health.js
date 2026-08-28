import { isRedisConfigured } from '../lib/redis-store.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ring = {
    clientIdConfigured: Boolean(process.env.RING_CLIENT_ID),
    clientSecretConfigured: Boolean(process.env.RING_CLIENT_SECRET),
    hmacConfigured: Boolean(process.env.RING_HMAC_SECRET),
    durableStorageConfigured: isRedisConfigured()
  };

  const readyForRing = Object.values(ring).every(Boolean);

  return res.status(readyForRing ? 200 : 503).json({
    service: 'cluckops-ring-backend',
    status: readyForRing ? 'ready' : 'needs_configuration',
    ring,
    time: new Date().toISOString()
  });
}
