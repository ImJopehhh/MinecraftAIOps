import test from 'node:test';
import assert from 'node:assert/strict';
import { gracefulRestart } from '../scripts/lib/lifecycle.js';

test('lifecycle: gracefulRestart follows clean stop and restart sequence', async () => {
  const sentCommands = [];
  const powerSignals = [];
  let pollCount = 0;

  const mockClient = {
    resolveServerId: () => 'srv-test-123',
    sendCommand: async (cmd, srvId) => {
      sentCommands.push({ cmd, srvId });
    },
    getServerUsage: async () => {
      pollCount++;
      // Sequence: starting -> running -> offline (after stop) -> starting -> running
      let state = 'running';
      if (pollCount === 1) state = 'stopping';
      else if (pollCount === 2) state = 'offline';
      else if (pollCount === 3) state = 'offline';
      else if (pollCount >= 4) state = 'running';

      return {
        attributes: {
          current_state: state,
        },
      };
    },
    setPowerState: async (signal, srvId) => {
      powerSignals.push({ signal, srvId });
    },
  };

  const logs = [];
  const result = await gracefulRestart(mockClient, 'srv-test-123', {
    pollIntervalMs: 5,
    stabilizeDelayMs: 0,
    shutdownTimeoutMs: 1000,
    bootTimeoutMs: 1000,
    onProgress: (msg) => logs.push(msg),
  });

  assert.equal(result.success, true);
  assert.equal(sentCommands.length, 1);
  assert.equal(sentCommands[0].cmd, 'stop');
  assert.equal(powerSignals.length, 1);
  assert.equal(powerSignals[0].signal, 'start');
  assert.ok(logs.some(l => l.includes('stop')));
});
