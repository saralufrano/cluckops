const RING_API_BASE = 'https://api.amazonvision.com';
const RING_OAUTH_TOKEN_URL = 'https://oauth.ring.com/oauth/token';

function ringCredentials(env = process.env) {
  const clientId = env.RING_CLIENT_ID || '';
  const clientSecret = env.RING_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('Ring OAuth credentials are not configured');
  return { clientId, clientSecret };
}

export async function exchangeRefreshToken(refreshToken, { env = process.env, fetchImpl = fetch } = {}) {
  if (!refreshToken) throw new Error('Missing Ring refresh token');
  const { clientId, clientSecret } = ringCredentials(env);

  const response = await fetchImpl(RING_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Ring token refresh failed (${response.status})`);
  }
  return payload;
}

export async function listRingDevices(accessToken, { fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error('Missing Ring access token');
  const response = await fetchImpl(`${RING_API_BASE}/v1/devices?include=status,capabilities,location,configurations`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Ring device discovery failed (${response.status})`);
  return payload;
}
