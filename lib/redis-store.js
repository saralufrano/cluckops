function redisConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return { url: url.replace(/\/$/, ''), token };
}

export function isRedisConfigured(env = process.env) {
  const { url, token } = redisConfig(env);
  return Boolean(url && token);
}

export async function redisCommand(command, { env = process.env, fetchImpl = fetch } = {}) {
  const { url, token } = redisConfig(env);
  if (!url || !token) throw new Error('Durable storage is not configured');

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Redis returned non-JSON response (${response.status})`);
  }

  if (!response.ok || payload?.error) {
    throw new Error(`Redis command failed: ${payload?.error || response.status}`);
  }

  return payload?.result;
}

export async function claimOnce(key, ttlSeconds, options = {}) {
  const result = await redisCommand(['SET', key, '1', 'NX', 'EX', ttlSeconds], options);
  return result === 'OK';
}

export async function setJson(key, value, ttlSeconds = null, options = {}) {
  const command = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds) command.push('EX', ttlSeconds);
  return redisCommand(command, options);
}

export async function getJson(key, options = {}) {
  const value = await redisCommand(['GET', key], options);
  return value == null ? null : JSON.parse(value);
}

export async function pushRecent(listKey, value, limit = 200, options = {}) {
  await redisCommand(['LPUSH', listKey, value], options);
  await redisCommand(['LTRIM', listKey, 0, Math.max(0, limit - 1)], options);
}
