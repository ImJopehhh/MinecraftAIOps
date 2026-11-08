import test from 'node:test';
import assert from 'node:assert/strict';
import { gracefulRestart, waitForBootComplete } from '../scripts/lib/lifecycle.js';

test('lifecycle: waitForBootComplete detects PaperMC Done milestone', async () => {
  const mockClient = {
    resolveServerId: () => 'srv-test-123',
    getFileContents: async () => `
[21:00:00 INFO]: Preparing spawn area: 100%
[21:00:02 INFO]: [Server thread/INFO]: Done (2.415s)! For help, type "help"
`,
  };

  const result = await waitForBootComplete(mockClient, 'srv-test-123', {
    bootTimeoutMs: 1000,
    pollIntervalMs: 5,
  });

  assert.equal(result.complete, true);
  assert.equal(result.durationSeconds, 2.415);
});

test('lifecycle: gracefulRestart follows clean stop and restart sequence with Done milestone', async () => {
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
    getFileContents: async () => `
[Server thread/INFO]: Done (1.890s)! For help, type "help"
`,
  };

  const logs = [];
  const result = await gracefulRestart(mockClient, 'srv-test-123', {
    pollIntervalMs: 5,
    stabilizeDelayMs: 0,
    shutdownTimeoutMs: 1000,
    bootTimeoutMs: 1000,
    waitForDone: true,
    onProgress: (msg) => logs.push(msg),
  });

  assert.equal(result.success, true);
  assert.equal(sentCommands.length, 1);
  assert.equal(sentCommands[0].cmd, 'stop');
  assert.equal(powerSignals.length, 1);
  assert.equal(powerSignals[0].signal, 'start');
  assert.ok(result.doneMilestone?.complete);
  assert.equal(result.doneMilestone?.durationSeconds, 1.89);
});
