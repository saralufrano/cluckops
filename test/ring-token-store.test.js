import test from 'node:test';
import assert from 'node:assert/strict';
import { saveRingTokens, loadRingTokens } from '../lib/ring-token-store.js';

const env = {
  RING_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token'
};

function fakeRedis() {
  const values = new Map();
  const commands = [];
  return {
    values,
    commands,
    async fetchImpl(_url, options) {
      const command = JSON.parse(options.body);
      commands.push(command);
      const [verb, key, value] = command;
      if (verb === 'SET') {
        values.set(key, value);
        return { ok: true, status: 200, async json() { return { result: 'OK' }; } };
      }
      if (verb === 'GET') {
        return { ok: true, status: 200, async json() { return { result: values.get(key) ?? null }; } };
      }
      throw new Error(`Unexpected Redis command ${verb}`);
    }
  };
}

test('stores Ring OAuth tokens encrypted and restores them', async () => {
  const redis = fakeRedis();
  await saveRingTokens({
    accountId: 'ava1.ring.account.chicken',
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    expiresIn: 14400,
    scope: 'devices',
    status: 'unclaimed'
  }, { env, fetchImpl: redis.fetchImpl });

  const raw = redis.values.get('ring:account:ava1.ring.account.chicken');
  assert.ok(raw);
  assert.doesNotMatch(raw, /access-secret|refresh-secret/);
  const stored = JSON.parse(raw);
  assert.match(stored.accessToken, /^v1\./);
  assert.match(stored.refreshToken, /^v1\./);
  assert.equal(stored.status, 'unclaimed');

  const loaded = await loadRingTokens('ava1.ring.account.chicken', { env, fetchImpl: redis.fetchImpl });
  assert.equal(loaded.accessToken, 'access-secret');
  assert.equal(loaded.refreshToken, 'refresh-secret');
  assert.equal(loaded.accountId, 'ava1.ring.account.chicken');
});

test('missing account ID or OAuth token fails closed', async () => {
  const redis = fakeRedis();
  await assert.rejects(() => saveRingTokens({ accountId: '', accessToken: 'a', refreshToken: 'r' }, { env, fetchImpl: redis.fetchImpl }), /account ID/);
  await assert.rejects(() => saveRingTokens({ accountId: 'acct', accessToken: '', refreshToken: 'r' }, { env, fetchImpl: redis.fetchImpl }), /OAuth tokens/);
});
