import { encryptSecret, decryptSecret } from './token-crypto.js';
import { getJson, setJson } from './redis-store.js';

const TOKEN_KEY_PREFIX = 'ring:account:';
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function accountKey(accountId) {
  if (!accountId) throw new Error('Missing Ring account ID');
  return `${TOKEN_KEY_PREFIX}${accountId}`;
}

export async function saveRingTokens({ accountId, accessToken, refreshToken, expiresIn, scope = null, status = 'unclaimed' }, options = {}) {
  if (!accessToken || !refreshToken) throw new Error('Missing Ring OAuth tokens');
  const now = Date.now();
  const expiresSeconds = Number(expiresIn) > 0 ? Number(expiresIn) : 14400;
  const record = {
    accountId,
    accessToken: encryptSecret(accessToken, options),
    refreshToken: encryptSecret(refreshToken, options),
    accessExpiresAt: new Date(now + expiresSeconds * 1000).toISOString(),
    refreshExpiresAt: new Date(now + DEFAULT_REFRESH_TTL_SECONDS * 1000).toISOString(),
    scope,
    status,
    updatedAt: new Date(now).toISOString()
  };

  await setJson(accountKey(accountId), record, DEFAULT_REFRESH_TTL_SECONDS, options);
  return { ...record, accessToken: undefined, refreshToken: undefined };
}

export async function loadRingTokens(accountId, options = {}) {
  const record = await getJson(accountKey(accountId), options);
  if (!record) return null;
  return {
    ...record,
    accessToken: decryptSecret(record.accessToken, options),
    refreshToken: decryptSecret(record.refreshToken, options)
  };
}
