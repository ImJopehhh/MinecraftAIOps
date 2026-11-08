import test from 'node:test';
import assert from 'node:assert/strict';
import { PteroClient, loadEnv } from '../scripts/lib/ptero-client.js';

test('ptero-client: resolves baseUrl and cleans trailing slashes', () => {
  const client = new PteroClient({
    url: 'https://panel.example.com///',
    apiKey: 'ptlc_test_token',
    serverId: 'srv123',
  });

  assert.equal(client.baseUrl, 'https://panel.example.com');
  assert.equal(client.apiKey, 'ptlc_test_token');
  assert.equal(client.defaultServerId, 'srv123');
  assert.equal(client.isConfigured(), true);
});

test('ptero-client: getHeaders generates proper Bearer token headers', () => {
  const client = new PteroClient({
    url: 'https://panel.example.com',
    apiKey: 'ptlc_mock_token_123',
  });

  const headers = client.getHeaders();
  assert.equal(headers['Authorization'], 'Bearer ptlc_mock_token_123');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('ptero-client: resolveServerId throws if no serverId is provided', () => {
  const client = new PteroClient({
    url: 'https://panel.example.com',
    apiKey: 'ptlc_mock_token_123',
  });

  assert.throws(() => {
    client.resolveServerId();
  }, /Server ID is required/);
});

test('ptero-client: throws on invalid power signal', async () => {
  const client = new PteroClient({
    url: 'https://panel.example.com',
    apiKey: 'ptlc_mock_token_123',
    serverId: 'srv123',
  });

  await assert.rejects(
    async () => {
      await client.setPowerState('destroy');
    },
    /Invalid power signal 'destroy'/
  );
});

