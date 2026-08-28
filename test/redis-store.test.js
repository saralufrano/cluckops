import test from 'node:test';
import assert from 'node:assert/strict';
import { claimOnce, getJson, isRedisConfigured, redisCommand, setJson } from '../lib/redis-store.js';

const env = {
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-token'
};

function mockFetch(result, status = 200) {
  return async (url, options) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return result; },
    url,
    options
  });
}

test('detects configured durable storage without exposing credentials', () => {
  assert.equal(isRedisConfigured(env), true);
  assert.equal(isRedisConfigured({}), false);
});

test('sends Redis commands as authenticated JSON POSTs', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, async json() { return { result: 'OK' }; } };
  };

  await redisCommand(['SET', 'foo', 'bar'], { env, fetchImpl });
  assert.equal(captured.url, env.UPSTASH_REDIS_REST_URL);
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, 'Bearer test-token');
  assert.equal(captured.options.body, JSON.stringify(['SET', 'foo', 'bar']));
});

test('claimOnce distinguishes first delivery from a duplicate', async () => {
  assert.equal(await claimOnce('ring:dedupe:req-1', 60, { env, fetchImpl: mockFetch({ result: 'OK' }) }), true);
  assert.equal(await claimOnce('ring:dedupe:req-1', 60, { env, fetchImpl: mockFetch({ result: null }) }), false);
});

test('round trips JSON serialization helpers', async () => {
  let command;
  const fetchSet = async (_url, options) => {
    command = JSON.parse(options.body);
    return { ok: true, status: 200, async json() { return { result: 'OK' }; } };
  };
  await setJson('thing', { chicken: 'Mabel' }, 30, { env, fetchImpl: fetchSet });
  assert.deepEqual(command, ['SET', 'thing', JSON.stringify({ chicken: 'Mabel' }), 'EX', 30]);

  const value = await getJson('thing', { env, fetchImpl: mockFetch({ result: JSON.stringify({ chicken: 'Mabel' }) }) });
  assert.deepEqual(value, { chicken: 'Mabel' });
});

test('fails closed when storage is missing or Redis errors', async () => {
  await assert.rejects(() => redisCommand(['GET', 'foo'], { env: {}, fetchImpl: mockFetch({ result: null }) }), /not configured/);
  await assert.rejects(() => redisCommand(['GET', 'foo'], { env, fetchImpl: mockFetch({ error: 'WRONGPASS' }, 401) }), /Redis command failed/);
});
