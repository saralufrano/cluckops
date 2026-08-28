import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStore() {
  const values = new Map();
  return {
    async set(key, value, options = {}) {
      if (options.nx && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async get(key) { return values.get(key) ?? null; }
  };
}

async function persistOnce(store, requestId, event) {
  if (!requestId) throw new Error('missing request_id');
  const claim = await store.set(`ring:dedupe:${requestId}`, '1', { nx: true });
  if (!claim) return { duplicate: true };
  await store.set(`ring:event:${requestId}`, JSON.stringify(event));
  return { duplicate: false };
}

test('same Ring request_id is persisted only once', async () => {
  const store = fakeStore();
  const event = { meta: { request_id: 'req-1' }, data: { type: 'motion_detected' } };
  assert.deepEqual(await persistOnce(store, 'req-1', event), { duplicate: false });
  assert.deepEqual(await persistOnce(store, 'req-1', event), { duplicate: true });
  assert.equal(JSON.parse(await store.get('ring:event:req-1')).data.type, 'motion_detected');
});

test('missing request_id is rejected instead of becoming an undedupable event', async () => {
  await assert.rejects(() => persistOnce(fakeStore(), '', {}), /missing request_id/);
});
