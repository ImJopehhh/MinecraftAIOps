import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIssues, parseLogLines } from '../scripts/lib/diagnostics.js';

test('diagnostics: detects PORT_BIND_ERROR', () => {
  const sampleLog = `
[21:00:01] [Server thread/INFO]: Starting Minecraft server on *:25565
[21:00:02] [Server thread/WARN]: **** FAILED TO BIND TO PORT!
[21:00:02] [Server thread/WARN]: The exception was: java.net.BindException: Address already in use: bind
[21:00:02] [Server thread/WARN]: Perhaps a server is already running on that port?
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'PORT_BIND_ERROR');
  assert.equal(issues[0].severity, 'FATAL');
});

test('diagnostics: detects JAVA_VERSION_MISMATCH', () => {
  const sampleLog = `
[Server thread/ERROR]: Could not load 'plugins/ModernPlugin.jar' in folder 'plugins'
org.bukkit.plugin.InvalidPluginException: java.lang.UnsupportedClassVersionError: com/example/plugin/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'JAVA_VERSION_MISMATCH');
});

test('diagnostics: detects MISSING_DEPENDENCY', () => {
  const sampleLog = `
[Server thread/ERROR]: Could not load 'plugins/ShopGUIPlus.jar' in folder 'plugins': org.bukkit.plugin.UnknownDependencyException: Vault
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'MISSING_DEPENDENCY');
});

test('diagnostics: detects OUT_OF_MEMORY', () => {
  const sampleLog = `
[Server thread/ERROR]: Exception in thread "Server thread" java.lang.OutOfMemoryError: Java heap space
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'OUT_OF_MEMORY');
});

test('diagnostics: detects WATCHDOG_FREEZE', () => {
  const sampleLog = `
[Paper Watchdog Thread/ERROR]: --- DO NOT REPORT THIS TO PAPER - THIS IS NOT A BUG OR A CRASH  - The server has stopped responding! This is (probably) not a Paper bug ---
[Paper Watchdog Thread/ERROR]: The server has not responded for 15 seconds! Creating thread dump
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'WATCHDOG_FREEZE');
});

test('diagnostics: detects GEYSER_NETHERNET_MISMATCH', () => {
  const sampleLog = `
[Geyser-Spigot] Failed to bind NetherNet transport listener on 0.0.0.0:19132
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'GEYSER_NETHERNET_MISMATCH');
});

test('diagnostics: detects CONFIG_SYNTAX_ERROR', () => {
  const sampleLog = `
[Server thread/ERROR]: Cannot load configuration from stream
org.yaml.snakeyaml.scanner.ScannerException: while scanning a simple key
 in 'reader', line 12, column 5:
    invalid_tab_here: true
`;
  const issues = detectIssues(sampleLog);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'CONFIG_SYNTAX_ERROR');
});

test('diagnostics: parseLogLines filters errors correctly', () => {
  const sampleLog = `
[21:00:00 INFO]: Preparing start region for dimension minecraft:overworld
[21:00:01 WARN]: Can't keep up! Is the server overloaded?
[21:00:02 ERROR]: [Vault] Missing Economy implementation!
`;
  const errorsOnly = parseLogLines(sampleLog, { filter: 'error' });
  assert.equal(errorsOnly.length, 1);
  assert.match(errorsOnly[0], /Missing Economy implementation/);

  const warnsAndErrors = parseLogLines(sampleLog, { filter: 'warn' });
  assert.equal(warnsAndErrors.length, 2);
});

