import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getRingUser,
  confirmRingAccountLink,
  completeRingAccountLink,
  listRingDevices
} from '../lib/ring-api.js';

const env = { RING_CLIENT_ID: 'client-id', RING_CLIENT_SECRET: 'client-secret' };

function okJson(payload) {
  return { ok: true, status: 200, async json() { return payload; } };
}

test('exchanges Ring authorization code with documented form fields', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ access_token: 'access', refresh_token: 'refresh', expires_in: 14400 });
  };

  const result = await exchangeAuthorizationCode('one-time-code', { env, fetchImpl });
  assert.equal(result.access_token, 'access');
  assert.equal(captured.url, 'https://oauth.ring.com/oauth/token');
  const body = new URLSearchParams(captured.options.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'one-time-code');
  assert.equal(body.get('client_id'), 'client-id');
  assert.equal(body.get('client_secret'), 'client-secret');
});

test('refreshes Ring access token with form-encoded client credentials', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ access_token: 'access', refresh_token: 'refresh2', expires_in: 14400 });
  };

  const result = await exchangeRefreshToken('refresh1', { env, fetchImpl });
  assert.equal(result.access_token, 'access');
  const body = new URLSearchParams(captured.options.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh1');
});

test('retrieves Ring Account ID from users/me', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ data: { type: 'users', id: 'ava1.ring.account.chicken', attributes: {} } });
  };
  const payload = await getRingUser('access', { fetchImpl });
  assert.equal(payload.data.id, 'ava1.ring.account.chicken');
  assert.equal(captured.url, 'https://api.amazonvision.com/v1/users/me');
  assert.equal(captured.options.headers.authorization, 'Bearer access');
});

test('confirms Ring account link with account identifier and nonce', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ data: { attributes: { status: 'awaiting' } } });
  };
  const payload = await confirmRingAccountLink('access', {
    accountIdentifier: 's***a@cluckops.local',
    nonce: 'nonce-value'
  }, { fetchImpl });
  assert.equal(payload.data.attributes.status, 'awaiting');
  assert.equal(captured.url, 'https://api.amazonvision.com/v1/accounts/me/app-integrations');
  assert.equal(captured.options.method, 'POST');
  assert.deepEqual(JSON.parse(captured.options.body), {
    account_identifier: 's***a@cluckops.local',
    nonce: 'nonce-value'
  });
});

test('completes Ring account link with mandatory completed status', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ data: { attributes: { status: 'completed' } } });
  };
  const payload = await completeRingAccountLink('access', { fetchImpl });
  assert.equal(payload.data.attributes.status, 'completed');
  assert.equal(captured.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(captured.options.body), { status: 'completed' });
});

test('discovers devices with access token and related resources', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return okJson({ data: [{ id: 'coop-camera' }] });
  };
  const payload = await listRingDevices('access', { fetchImpl });
  assert.equal(payload.data[0].id, 'coop-camera');
  assert.match(captured.url, /\/v1\/devices\?include=status,capabilities,location,configurations$/);
  assert.equal(captured.options.headers.authorization, 'Bearer access');
});

test('fails safely on missing inputs and Ring errors', async () => {
  await assert.rejects(() => exchangeAuthorizationCode('', { env }), /Missing Ring authorization code/);
  await assert.rejects(() => exchangeRefreshToken('', { env }), /Missing Ring refresh token/);
  await assert.rejects(() => getRingUser(''), /Missing Ring access token/);
  await assert.rejects(() => listRingDevices(''), /Missing Ring access token/);
  await assert.rejects(() => confirmRingAccountLink('access', { accountIdentifier: '', nonce: 'x' }), /Missing partner account identifier/);
  await assert.rejects(() => confirmRingAccountLink('access', { accountIdentifier: 'masked', nonce: '' }), /Missing Ring account-link nonce/);
  await assert.rejects(() => exchangeRefreshToken('bad', {
    env,
    fetchImpl: async () => ({ ok: false, status: 401, async json() { return { error: 'invalid_grant' }; } })
  }), /token refresh failed \(401\)/);
  await assert.rejects(() => exchangeAuthorizationCode('bad', {
    env,
    fetchImpl: async () => ({ ok: false, status: 400, async json() { return { error: 'invalid_grant' }; } })
  }), /authorization code exchange failed \(400\)/);
  await assert.rejects(() => completeRingAccountLink('access', {
    fetchImpl: async () => ({ ok: false, status: 500, async json() { return { error: 'server_error' }; } })
  }), /account-link completion failed \(500\)/);
});
