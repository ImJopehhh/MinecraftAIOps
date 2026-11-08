#!/usr/bin/env node

/**
 * Minecraft AIOps - Unified Pterodactyl CLI Runner
 * Executable by any AI Agent or human developer via terminal.
 */

import { PteroClient } from './lib/ptero-client.js';
import { detectIssues, formatDiagnosticReport, parseLogLines } from './lib/diagnostics.js';
import { patchProperties, patchYamlKey, createDiff } from './lib/config-editor.js';

const client = new PteroClient();

function printHelp() {
  console.log(`
Minecraft AIOps - Pterodactyl CLI Runner

USAGE:
  node scripts/ptero.js <subcommand> [arguments...]

SUBCOMMANDS:
  usage [serverId]                          Display real-time CPU, RAM, Disk, and Uptime metrics.
  info [serverId]                           Display server specifications, limits, and port allocations.
  logs [serverId] [--filter=error|warn|all] Read remote logs/latest.log with optional filtering.
  diagnose [serverId]                       Analyze server logs and automatically identify root causes.
  cmd <command...> [serverId]               Send console command to server (e.g., 'plugins', 'spark health').
  power <start|stop|restart|kill> [srvId]   Send power action signal to server.
  files [directory] [serverId]              List files and directories on remote server.
  read-file <remotePath> [serverId]         Display contents of a remote file.
  backup <remotePath> [serverId]            Create backup copy (<path>.bak) on remote server.
  rollback <remotePath> [serverId]          Restore file from backup copy (<path>.bak).
  patch-prop <filePath> <key> <val> [srvId] Modify key in server.properties with auto-backup & diff.
  patch-yaml <filePath> <path> <val> [srvId]Modify nested key in YAML with auto-backup & diff.
  upload <localFile> [remoteDir] [serverId] Upload local file (e.g., plugin .jar) to remote server.

ENVIRONMENT:
  PTERO_URL         Pterodactyl panel URL (e.g., https://panel.example.com)
  PTERO_CLIENT_KEY  Pterodactyl Client API key (starts with ptlc_)
  PTERO_SERVER_ID   Default server identifier
`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function parseFlags(args) {
  const flags = {};
  const cleanArgs = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      cleanArgs.push(arg);
    }
  }
  return { flags, cleanArgs };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }

  const { flags, cleanArgs } = parseFlags(rawArgs);
  const command = cleanArgs[0];

  if (!client.isConfigured()) {
    console.error(`
[CONFIG ERROR] Pterodactyl URL or API Key is not configured!
Ensure .env file exists with the following configuration:
  PTERO_URL=https://panel.example.com
  PTERO_CLIENT_KEY=ptlc_xxxxxxxxxxxxxxxxxxxxxxxx
  PTERO_SERVER_ID=xxxxxxxx

AI AGENT ACTION:
Prompt the user for their Pterodactyl Panel URL and Client API Key, then save them into the .env file.
`);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'usage': {
        const serverId = cleanArgs[1];
        const data = await client.getServerUsage(serverId);
        const stats = data.attributes?.resources || {};
        const state = data.attributes?.current_state || 'unknown';
        console.log(`=== SERVER STATUS [${state.toUpperCase()}] ===`);
        console.log(`CPU Usage : ${stats.cpu_absolute?.toFixed(1) || 0}%`);
        console.log(`Memory    : ${formatBytes(stats.memory_bytes || 0)}`);
        console.log(`Disk      : ${formatBytes(stats.disk_bytes || 0)}`);
        console.log(`Network Rx: ${formatBytes(stats.network_rx_bytes || 0)} | Tx: ${formatBytes(stats.network_tx_bytes || 0)}`);
        console.log(`Uptime    : ${stats.uptime ? `${Math.floor(stats.uptime / 1000 / 60)} minutes` : 'Offline'}`);
        break;
      }

      case 'info': {
        const serverId = cleanArgs[1];
        const data = await client.getServerDetails(serverId);
        const attr = data.attributes || {};
        console.log(`=== SERVER INFO: ${attr.name} (${attr.identifier}) ===`);
        console.log(`Node       : ${attr.node}`);
        console.log(`Suspended  : ${attr.is_suspended ? 'YES' : 'NO'}`);
        console.log(`Limits     : RAM ${attr.limits?.memory}MB | Disk ${attr.limits?.disk}MB | CPU ${attr.limits?.cpu}%`);
        const allocations = attr.relationships?.allocations?.data || [];
        if (allocations.length > 0) {
          console.log('\nAllocations (Ports):');
          allocations.forEach(a => {
            const att = a.attributes;
            console.log(`- ${att.ip_alias || att.ip}:${att.port} ${att.is_default ? '(Default)' : ''}`);
          });
        }
        break;
      }

      case 'logs': {
        const serverId = cleanArgs[1];
        const filter = flags.filter || 'all';
        const maxLines = parseInt(flags.lines, 10) || 100;
        const raw = await client.getFileContents('logs/latest.log', serverId);
        const lines = parseLogLines(raw, { filter, maxLines });
        console.log(lines.join('\n'));
        break;
      }

      case 'diagnose': {
        const serverId = cleanArgs[1];
        let rawLogs = '';
        try {
          rawLogs = await client.getFileContents('logs/latest.log', serverId);
        } catch {
          console.warn('Warning: logs/latest.log was not found or could not be read.');
        }
        const issues = detectIssues(rawLogs);
        console.log(formatDiagnosticReport(issues));
        break;
      }

      case 'cmd': {
        const cmdText = cleanArgs.slice(1).join(' ');
        if (!cmdText) {
          console.error('Error: Please provide a console command to send.');
          process.exit(1);
        }
        await client.sendCommand(cmdText);
        console.log(`✅ Console command sent: "${cmdText}"`);
        break;
      }

      case 'power': {
        const signal = cleanArgs[1];
        const serverId = cleanArgs[2];
        await client.setPowerState(signal, serverId);
        console.log(`✅ Power action '${signal}' successfully delivered to server.`);
        break;
      }

      case 'files': {
        const dir = cleanArgs[1] || '/';
        const serverId = cleanArgs[2];
        const list = await client.listFiles(dir, serverId);
        const items = list.data || [];
        console.log(`=== FILES IN [${dir}] (${items.length} items) ===`);
        for (const item of items) {
          const a = item.attributes;
          const type = a.is_file ? 'FILE' : 'DIR ';
          console.log(`[${type}] ${a.name.padEnd(30)} ${formatBytes(a.size)}`);
        }
        break;
      }

      case 'read-file': {
        const filePath = cleanArgs[1];
        const serverId = cleanArgs[2];
        if (!filePath) {
          console.error('Error: Specify the file path to read.');
          process.exit(1);
        }
        const content = await client.getFileContents(filePath, serverId);
        console.log(content);
        break;
      }

      case 'backup': {
        const filePath = cleanArgs[1];
        const serverId = cleanArgs[2];
        const res = await client.backupFile(filePath, serverId);
        console.log(`✅ File backed up to '${res.backup}' (${res.size} bytes).`);
        break;
      }

      case 'rollback': {
        const filePath = cleanArgs[1];
        const serverId = cleanArgs[2];
        const res = await client.rollbackFile(filePath, serverId);
        console.log(`✅ File rolled back from '${res.from}' to '${res.restored}'.`);
        break;
      }

      case 'patch-prop': {
        const filePath = cleanArgs[1];
        const key = cleanArgs[2];
        const val = cleanArgs[3];
        const serverId = cleanArgs[4];
        if (!filePath || !key || val === undefined) {
          console.error('Usage: node scripts/ptero.js patch-prop <filePath> <key> <val> [serverId]');
          process.exit(1);
        }
        await client.backupFile(filePath, serverId);
        const original = await client.getFileContents(filePath, serverId);
        const patched = patchProperties(original, { [key]: val });
        console.log('=== CONFIG CHANGES (DIFF) ===');
        console.log(createDiff(original, patched, filePath));
        await client.writeFile(filePath, patched, serverId);
        console.log(`✅ Successfully patched property '${key}' in ${filePath}. Backup saved as ${filePath}.bak.`);
        break;
      }

      case 'patch-yaml': {
        const filePath = cleanArgs[1];
        const dotPath = cleanArgs[2];
        const val = cleanArgs[3];
        const serverId = cleanArgs[4];
        if (!filePath || !dotPath || val === undefined) {
          console.error('Usage: node scripts/ptero.js patch-yaml <filePath> <dotPath> <val> [serverId]');
          process.exit(1);
        }
        await client.backupFile(filePath, serverId);
        const original = await client.getFileContents(filePath, serverId);
        const patched = patchYamlKey(original, dotPath, val);
        console.log('=== CONFIG CHANGES (DIFF) ===');
        console.log(createDiff(original, patched, filePath));
        await client.writeFile(filePath, patched, serverId);
        console.log(`✅ Successfully patched YAML key '${dotPath}' in ${filePath}. Backup saved as ${filePath}.bak.`);
        break;
      }

      case 'upload': {
        const localFile = cleanArgs[1];
        const remoteDir = cleanArgs[2] || '/';
        const serverId = cleanArgs[3];
        if (!localFile) {
          console.error('Usage: node scripts/ptero.js upload <localFile> [remoteDir] [serverId]');
          process.exit(1);
        }
        const res = await client.uploadFile(remoteDir, localFile, serverId);
        console.log(`✅ File '${res.file}' successfully uploaded to '${res.directory}'.`);
        break;
      }

      default:
        console.error(`Subcommand '${command}' not recognized.`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.details) {
      console.error('API Response:', JSON.stringify(err.details, null, 2));
    }
    process.exit(1);
  }
}

main();
