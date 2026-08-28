import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeRefreshToken, listRingDevices } from '../lib/ring-api.js';

const env = { RING_CLIENT_ID: 'client-id', RING_CLIENT_SECRET: 'client-secret' };

test('refreshes Ring access token with form-encoded client credentials', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, async json() { return { access_token: 'access', refresh_token: 'refresh2', expires_in: 14400 }; } };
  };

  const result = await exchangeRefreshToken('refresh1', { env, fetchImpl });
  assert.equal(result.access_token, 'access');
  assert.equal(captured.url, 'https://oauth.ring.com/oauth/token');
  const body = new URLSearchParams(captured.options.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh1');
  assert.equal(body.get('client_id'), 'client-id');
  assert.equal(body.get('client_secret'), 'client-secret');
});

test('discovers devices with access token and related resources', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, async json() { return { data: [{ id: 'coop-camera' }] }; } };
  };
  const payload = await listRingDevices('access', { fetchImpl });
  assert.equal(payload.data[0].id, 'coop-camera');
  assert.match(captured.url, /\/v1\/devices\?include=status,capabilities,location,configurations$/);
  assert.equal(captured.options.headers.authorization, 'Bearer access');
});

test('fails safely on missing tokens and Ring errors', async () => {
  await assert.rejects(() => exchangeRefreshToken('', { env }), /Missing Ring refresh token/);
  await assert.rejects(() => listRingDevices(''), /Missing Ring access token/);
  await assert.rejects(() => exchangeRefreshToken('bad', {
    env,
    fetchImpl: async () => ({ ok: false, status: 401, async json() { return { error: 'invalid_grant' }; } })
  }), /token refresh failed \(401\)/);
});
