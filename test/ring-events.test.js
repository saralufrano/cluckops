import test from 'node:test';
import assert from 'node:assert/strict';
import { persistRingEvent } from '../lib/ring-events.js';

const env = {
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-token'
};

function sequenceFetch(results) {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const command = JSON.parse(options.body);
    calls.push(command);
    const next = results.shift();
    return { ok: true, status: 200, async json() { return next; } };
  };
  return { fetchImpl, calls };
}

const summary = {
  requestId: 'req-123',
  accountId: 'acct-456',
  eventType: 'motion_detected',
  deviceId: 'device-789',
  timestamp: 1770989995231
};

test('persists first Ring delivery and records recent event', async () => {
  const { fetchImpl, calls } = sequenceFetch([
    { result: 'OK' },
    { result: 'OK' },
    { result: 1 },
    { result: 'OK' }
  ]);

  const result = await persistRingEvent(summary, { env, fetchImpl });
  assert.equal(result.duplicate, false);
  assert.deepEqual(calls[0].slice(0, 3), ['SET', 'ring:dedupe:req-123', '1']);
  assert.equal(calls[1][0], 'SET');
  assert.equal(calls[2][0], 'LPUSH');
  assert.equal(calls[3][0], 'LTRIM');
});

test('acknowledges duplicate delivery without writing event twice', async () => {
  const { fetchImpl, calls } = sequenceFetch([{ result: null }]);
  const result = await persistRingEvent(summary, { env, fetchImpl });
  assert.deepEqual(result, { duplicate: true });
  assert.equal(calls.length, 1);
});

test('releases dedupe claim if event persistence fails so Ring may retry', async () => {
  const calls = [];
  let index = 0;
  const fetchImpl = async (_url, options) => {
    const command = JSON.parse(options.body);
    calls.push(command);
    index += 1;
    if (index === 1) return { ok: true, status: 200, async json() { return { result: 'OK' }; } };
    if (index === 2) return { ok: false, status: 500, async json() { return { error: 'boom' }; } };
    return { ok: true, status: 200, async json() { return { result: 1 }; } };
  };

  await assert.rejects(() => persistRingEvent(summary, { env, fetchImpl }), /Redis command failed/);
  assert.deepEqual(calls.at(-1), ['DEL', 'ring:dedupe:req-123']);
});
