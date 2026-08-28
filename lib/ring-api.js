const RING_API_BASE = 'https://api.amazonvision.com';
const RING_OAUTH_TOKEN_URL = 'https://oauth.ring.com/oauth/token';

function ringCredentials(env = process.env) {
  const clientId = env.RING_CLIENT_ID || '';
  const clientSecret = env.RING_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('Ring OAuth credentials are not configured');
  return { clientId, clientSecret };
}

async function exchangeToken(body, errorLabel, { env = process.env, fetchImpl = fetch } = {}) {
  const { clientId, clientSecret } = ringCredentials(env);
  const response = await fetchImpl(RING_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    throw new Error(`${errorLabel} (${response.status})`);
  }
  return payload;
}

async function ringJsonRequest(path, accessToken, { method = 'GET', body, fetchImpl = fetch, errorLabel = 'Ring API request failed' } = {}) {
  if (!accessToken) throw new Error('Missing Ring access token');
  const headers = { authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetchImpl(`${RING_API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${errorLabel} (${response.status})`);
  return payload;
}

export async function exchangeAuthorizationCode(code, options = {}) {
  if (!code) throw new Error('Missing Ring authorization code');
  return exchangeToken({ grant_type: 'authorization_code', code }, 'Ring authorization code exchange failed', options);
}

export async function exchangeRefreshToken(refreshToken, options = {}) {
  if (!refreshToken) throw new Error('Missing Ring refresh token');
  return exchangeToken({ grant_type: 'refresh_token', refresh_token: refreshToken }, 'Ring token refresh failed', options);
}

export async function getRingUser(accessToken, options = {}) {
  const payload = await ringJsonRequest('/v1/users/me', accessToken, { ...options, errorLabel: 'Ring user lookup failed' });
  if (!payload?.data?.id) throw new Error('Ring user lookup returned no account ID');
  return payload;
}

export async function confirmRingAccountLink(accessToken, { accountIdentifier, nonce }, options = {}) {
  if (!accountIdentifier) throw new Error('Missing partner account identifier');
  if (!nonce) throw new Error('Missing Ring account-link nonce');
  return ringJsonRequest('/v1/accounts/me/app-integrations', accessToken, {
    ...options,
    method: 'POST',
    body: { account_identifier: accountIdentifier, nonce },
    errorLabel: 'Ring account-link confirmation failed'
  });
}

export async function completeRingAccountLink(accessToken, options = {}) {
  return ringJsonRequest('/v1/accounts/me/app-integrations', accessToken, {
    ...options,
    method: 'PATCH',
    body: { status: 'completed' },
    errorLabel: 'Ring account-link completion failed'
  });
}

export async function listRingDevices(accessToken, options = {}) {
  return ringJsonRequest('/v1/devices?include=status,capabilities,location,configurations', accessToken, {
    ...options,
    errorLabel: 'Ring device discovery failed'
  });
}
