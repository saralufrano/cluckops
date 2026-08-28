export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    service: 'cluckops-ring-backend',
    status: 'ok',
    ring: {
      clientIdConfigured: Boolean(process.env.RING_CLIENT_ID),
      clientSecretConfigured: Boolean(process.env.RING_CLIENT_SECRET),
      hmacConfigured: Boolean(process.env.RING_HMAC_SECRET)
    },
    time: new Date().toISOString()
  });
}
