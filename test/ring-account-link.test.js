import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRingLinkNonce, matchRingLinkNonce, validateRingLinkTime } from '../lib/ring-account-link.js';

const env = { RING_HMAC_SECRET: 'super-secret-hmac-key' };
const now = 1771130906289;
const time = now - 30_000;

test('computes URL-safe base64 nonce without padding', () => {
  const nonce = computeRingLinkNonce(time, 'ava1.ring.account.chicken', { env });
  assert.match(nonce, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(nonce, /=/);
});

test('matches nonce only to the correct unclaimed account', () => {
  const goodAccount = 'ava1.ring.account.good';
  const nonce = computeRingLinkNonce(time, goodAccount, { env });
  const matched = matchRingLinkNonce({
    nonce,
    time,
    now,
    tokenRecords: [
      { accountId: 'ava1.ring.account.wrong', status: 'unclaimed' },
      { accountId: goodAccount, status: 'unclaimed' }
    ]
  }, { env });
  assert.equal(matched.accountId, goodAccount);
});

test('does not match claimed tokens or forged nonces', () => {
  const accountId = 'ava1.ring.account.chicken';
  const nonce = computeRingLinkNonce(time, accountId, { env });
  assert.equal(matchRingLinkNonce({ nonce, time, now, tokenRecords: [{ accountId, status: 'claimed' }] }, { env }), null);
  assert.equal(matchRingLinkNonce({ nonce: `${nonce}x`, time, now, tokenRecords: [{ accountId, status: 'unclaimed' }] }, { env }), null);
});

test('rejects stale, future, malformed, and missing link values', () => {
  assert.throws(() => validateRingLinkTime(now - 600_001, now), /expired/);
  assert.throws(() => validateRingLinkTime(now + 1, now), /future/);
  assert.throws(() => validateRingLinkTime('nope', now), /Invalid/);
  assert.throws(() => matchRingLinkNonce({ nonce: '', time, now, tokenRecords: [] }, { env }), /Missing Ring account-link nonce/);
  assert.throws(() => computeRingLinkNonce(time, 'acct', { env: {} }), /HMAC secret/);
});
