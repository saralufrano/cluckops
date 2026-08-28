import test from 'node:test';
import assert from 'node:assert/strict';
import { saveRingTokens, loadRingTokens, listUnclaimedRingTokens, markRingTokensClaimed } from '../lib/ring-token-store.js';

const env = {
  RING_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token'
};

function fakeRedis() {
  const values = new Map();
  const sets = new Map();
  const commands = [];
  return {
    values,
    sets,
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
      if (verb === 'SADD') {
        const set = sets.get(key) || new Set();
        const before = set.size;
        set.add(value);
        sets.set(key, set);
        return { ok: true, status: 200, async json() { return { result: set.size > before ? 1 : 0 }; } };
      }
      if (verb === 'SREM') {
        const set = sets.get(key) || new Set();
        const removed = set.delete(value) ? 1 : 0;
        sets.set(key, set);
        return { ok: true, status: 200, async json() { return { result: removed }; } };
      }
      if (verb === 'SMEMBERS') {
        const set = sets.get(key) || new Set();
        return { ok: true, status: 200, async json() { return { result: [...set] }; } };
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
  assert.ok(redis.sets.get('ring:accounts:unclaimed').has('ava1.ring.account.chicken'));

  const loaded = await loadRingTokens('ava1.ring.account.chicken', { env, fetchImpl: redis.fetchImpl });
  assert.equal(loaded.accessToken, 'access-secret');
  assert.equal(loaded.refreshToken, 'refresh-secret');
  assert.equal(loaded.accountId, 'ava1.ring.account.chicken');
});

test('lists unclaimed records and removes them from pool when claimed', async () => {
  const redis = fakeRedis();
  await saveRingTokens({
    accountId: 'acct-1', accessToken: 'a1', refreshToken: 'r1', status: 'unclaimed'
  }, { env, fetchImpl: redis.fetchImpl });

  const before = await listUnclaimedRingTokens({ env, fetchImpl: redis.fetchImpl });
  assert.equal(before.length, 1);
  assert.equal(before[0].accountId, 'acct-1');

  await markRingTokensClaimed('acct-1', { partnerAccountIdentifier: 's***a@cluckops.local' }, { env, fetchImpl: redis.fetchImpl });
  const after = await listUnclaimedRingTokens({ env, fetchImpl: redis.fetchImpl });
  assert.equal(after.length, 0);
  const loaded = await loadRingTokens('acct-1', { env, fetchImpl: redis.fetchImpl });
  assert.equal(loaded.status, 'claimed');
  assert.equal(loaded.partnerAccountIdentifier, 's***a@cluckops.local');
});

test('missing account ID or OAuth token fails closed', async () => {
  const redis = fakeRedis();
  await assert.rejects(() => saveRingTokens({ accountId: '', accessToken: 'a', refreshToken: 'r' }, { env, fetchImpl: redis.fetchImpl }), /account ID/);
  await assert.rejects(() => saveRingTokens({ accountId: 'acct', accessToken: '', refreshToken: 'r' }, { env, fetchImpl: redis.fetchImpl }), /OAuth tokens/);
  await assert.rejects(() => markRingTokensClaimed('missing', {}, { env, fetchImpl: redis.fetchImpl }), /not found/);
});
