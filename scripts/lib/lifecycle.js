/**
 * Minecraft Server Lifecycle Manager
 * Implements clean, graceful shutdowns allowing PaperMC to flush world chunks
 * and close database pools (HikariCP/SQLite) cleanly before restarting.
 * Verifies the "Done (X.Xs)!" boot milestone before declaring completion.
 */

/**
 * Poll logs/latest.log until PaperMC outputs "Done (X.Xs)!" indicating full startup.
 *
 * @param {import('./ptero-client.js').PteroClient} client
 * @param {string} [serverId]
 * @param {object} [options]
 * @param {number} [options.bootTimeoutMs=60000]
 * @param {number} [options.pollIntervalMs=2000]
 * @param {(msg: string) => void} [options.onProgress]
 * @returns {Promise<{ complete: boolean, durationSeconds?: number, timeout?: boolean }>}
 */
export async function waitForBootComplete(client, serverId, options = {}) {
  const timeoutMs = options.bootTimeoutMs || 60000;
  const pollIntervalMs = options.pollIntervalMs || 2000;
  const log = options.onProgress || (() => {});
  const id = client.resolveServerId(serverId);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const logs = await client.getFileContents('logs/latest.log', id);
      const match = logs.match(/\[Server thread\/INFO\]:\s*Done\s*\(([\d\.]+)s\)!/);
      if (match) {
        log(`PaperMC boot milestone reached: Done (${match[1]}s)! Server is fully ready.`);
        return { complete: true, durationSeconds: parseFloat(match[1]) };
      }
    } catch {
      // Log might be temporarily rotating or empty during early startup
    }
    await sleep(pollIntervalMs);
  }
  return { complete: false, timeout: true };
}

/**
 * Perform a clean, graceful restart by dispatching console 'stop' command,
 * waiting for PaperMC onDisable() to finish, ensuring the server powers back on,
 * and observing the "Done (X.Xs)!" log milestone.
 *
 * @param {import('./ptero-client.js').PteroClient} client
 * @param {string} [serverId]
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs=2000]
 * @param {number} [options.shutdownTimeoutMs=60000]
 * @param {number} [options.bootTimeoutMs=60000]
 * @param {number} [options.stabilizeDelayMs=3000]
 * @param {boolean} [options.waitForDone=true]
 * @param {(msg: string) => void} [options.onProgress]
 * @returns {Promise<{ success: boolean, shutdownDurationMs: number, bootDurationMs: number, totalDurationMs: number, doneMilestone?: object }>}
 */
export async function gracefulRestart(client, serverId, options = {}) {
  const pollInterval = options.pollIntervalMs || 2000;
  const shutdownTimeout = options.shutdownTimeoutMs || 60000;
  const bootTimeout = options.bootTimeoutMs || 60000;
  const stabilizeDelay = options.stabilizeDelayMs !== undefined ? options.stabilizeDelayMs : 3000;
  const waitForDone = options.waitForDone !== undefined ? options.waitForDone : true;
  const log = options.onProgress || (() => {});

  const startTime = Date.now();
  const id = client.resolveServerId(serverId);

  log('Initiating graceful shutdown via console command "stop"...');
  await client.sendCommand('stop', id);

  // Phase 1: Wait for server to reach 'offline'
  log('Waiting for PaperMC to flush chunks and close database connections...');
  const shutdownStart = Date.now();
  let isOffline = false;

  while (Date.now() - shutdownStart < shutdownTimeout) {
    await sleep(pollInterval);
    try {
      const usage = await client.getServerUsage(id);
      const state = usage.attributes?.current_state;
      log(`Shutdown status: ${state}`);
      if (state === 'offline') {
        isOffline = true;
        break;
      }
    } catch {
      // During shutdown, brief socket disconnects can happen
    }
  }

  if (!isOffline) {
    throw new Error(`Graceful shutdown timed out after ${shutdownTimeout / 1000}s. Server did not reach 'offline' state.`);
  }

  const shutdownDurationMs = Date.now() - shutdownStart;
  log(`Clean shutdown completed in ${(shutdownDurationMs / 1000).toFixed(1)}s.`);

  // Phase 2: Check if Wings auto-started the server (crash-detection/restart policy)
  if (stabilizeDelay > 0) {
    await sleep(stabilizeDelay);
  }
  let currentUsage = await client.getServerUsage(id);
  let currentState = currentUsage.attributes?.current_state;

  if (currentState !== 'running' && currentState !== 'starting') {
    log('Server remains offline. Dispatching "start" power signal...');
    await client.setPowerState('start', id);
  } else {
    log(`Daemon auto-reboot detected (current state: ${currentState}).`);
  }

  // Phase 3: Wait for server to reach 'running' or 'starting'
  const bootStart = Date.now();
  let isBooted = false;

  while (Date.now() - bootStart < bootTimeout) {
    await sleep(pollInterval);
    try {
      const usage = await client.getServerUsage(id);
      const state = usage.attributes?.current_state;
      log(`Boot status: ${state}`);
      if (state === 'running' || state === 'starting') {
        isBooted = true;
        break;
      }
    } catch {
      // Temporary connection hiccup during container initialization
    }
  }

  // Phase 4: Observe "Done (X.Xs)!" boot milestone
  let doneMilestone = null;
  if (isBooted && waitForDone) {
    log('Waiting for PaperMC "Done (X.Xs)!" milestone in logs...');
    doneMilestone = await waitForBootComplete(client, id, {
      bootTimeoutMs: Math.max(bootTimeout - (Date.now() - bootStart), 15000),
      pollIntervalMs: pollInterval,
      onProgress: log,
    });
  }

  const bootDurationMs = Date.now() - bootStart;
  const totalDurationMs = Date.now() - startTime;

  return {
    success: isBooted,
    shutdownDurationMs,
    bootDurationMs,
    totalDurationMs,
    doneMilestone,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
