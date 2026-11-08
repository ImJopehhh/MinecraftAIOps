/**
 * Minecraft Server Lifecycle Manager
 * Implements clean, graceful shutdowns allowing PaperMC to flush world chunks
 * and close database pools (HikariCP/SQLite) cleanly before restarting.
 */

/**
 * Perform a clean, graceful restart by dispatching console 'stop' command,
 * waiting for PaperMC onDisable() to finish, and ensuring the server powers back on.
 *
 * @param {import('./ptero-client.js').PteroClient} client
 * @param {string} [serverId]
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs=2000]
 * @param {number} [options.shutdownTimeoutMs=60000]
 * @param {number} [options.bootTimeoutMs=60000]
 * @param {(msg: string) => void} [options.onProgress]
 * @returns {Promise<{ success: boolean, shutdownDurationMs: number, bootDurationMs: number, totalDurationMs: number }>}
 */
export async function gracefulRestart(client, serverId, options = {}) {
  const pollInterval = options.pollIntervalMs || 2000;
  const shutdownTimeout = options.shutdownTimeoutMs || 60000;
  const bootTimeout = options.bootTimeoutMs || 60000;
  const stabilizeDelay = options.stabilizeDelayMs !== undefined ? options.stabilizeDelayMs : 3000;
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
  // Wait to observe daemon state
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

  const bootDurationMs = Date.now() - bootStart;
  const totalDurationMs = Date.now() - startTime;

  return {
    success: isBooted,
    shutdownDurationMs,
    bootDurationMs,
    totalDurationMs,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
