# Minecraft AIOps

> Autonomous SRE and DevOps assistant for Minecraft server management, diagnostics, and optimization via Pterodactyl Client API.
> Universal tool for **Antigravity, Claude Code, Cursor, Codex, Gemini CLI**, and human server administrators.

---

## All Usages & API Reference

Below is the comprehensive reference of all CLI commands, core libraries, and diagnostic functions included in this toolkit.

### 1. CLI Commands (`scripts/ptero.js`)

All CLI commands can be executed in a terminal by human operators or invoked by AI Agents via shell tools:

| Command | Arguments / Flags | Description | Example Usage |
| :--- | :--- | :--- | :--- |
| `usage` | `[serverId]` | Displays real-time CPU (%), RAM, Disk, Uptime, and server state. | `node scripts/ptero.js usage` |
| `info` | `[serverId]` | Displays server details, limits (CPU, RAM, Disk), and allocated network ports. | `node scripts/ptero.js info` |
| `logs` | `[serverId] [--filter=all\|error\|warn] [--lines=N]` | Reads remote `logs/latest.log` with optional error or warning filtering. | `node scripts/ptero.js logs --filter=error --lines=50` |
| `diagnose` | `[serverId]` | Automatically analyzes server logs and matches against known Minecraft issue signatures. | `node scripts/ptero.js diagnose` |
| `cmd` | `<command...> [serverId]` | Sends console command to server (e.g., status, reload, or diagnostic commands). | `node scripts/ptero.js cmd "plugins"` |
| `power` | `<start\|stop\|restart\|kill> [serverId]` | Sends power control action signal to Pterodactyl container. | `node scripts/ptero.js power restart` |
| `files` | `[directory] [serverId]` | Lists files and directories in remote server path. | `node scripts/ptero.js files plugins/` |
| `read-file` | `<remotePath> [serverId]` | Reads raw text contents of a remote server file. | `node scripts/ptero.js read-file server.properties` |
| `backup` | `<remotePath> [serverId]` | Duplicates remote file to `<remotePath>.bak` as a safety snapshot. | `node scripts/ptero.js backup server.properties` |
| `rollback` | `<remotePath> [serverId]` | Restores remote file from its backup copy `<remotePath>.bak`. | `node scripts/ptero.js rollback server.properties` |
| `patch-prop`| `<filePath> <key> <val> [serverId]` | In-place patches key in Java properties file with auto-backup and diff output. | `node scripts/ptero.js patch-prop server.properties server-port 25577` |
| `patch-yaml`| `<filePath> <dotPath> <val> [serverId]` | In-place patches nested key in YAML file with auto-backup and diff output. | `node scripts/ptero.js patch-yaml plugins/Geyser-Spigot/config.yml bedrock.transport raknet` |
| `upload` | `<localFile> [remoteDir] [serverId]` | Uploads a local file (e.g., plugin `.jar`) to remote server using signed upload URL. | `node scripts/ptero.js upload ./Spark.jar plugins/` |

---

### 2. Library Reference: `PteroClient` (`scripts/lib/ptero-client.js`)

Standalone HTTP client module built on native Node.js ESM `fetch` for interacting with Pterodactyl Client API:

| Method | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `constructor(options)` | `{ url, apiKey, serverId }` | `PteroClient` | Initializes client (auto-loads `.env` if options omitted). |
| `isConfigured()` | - | `boolean` | Verifies whether `baseUrl` and `apiKey` are present. |
| `getServerDetails(serverId)` | `serverId?: string` | `Promise<Object>` | Fetches server metadata, node name, feature limits, and allocated IP/port list. |
| `getServerUsage(serverId)` | `serverId?: string` | `Promise<Object>` | Fetches real-time metrics (CPU %, memory bytes, disk bytes, uptime, state). |
| `sendCommand(command, serverId)`| `command: string, serverId?: string` | `Promise<Object>` | Dispatches console command string to server. |
| `setPowerState(signal, serverId)` | `signal: 'start'\|'stop'\|'restart'\|'kill', serverId?: string` | `Promise<Object>` | Dispatches power action signal. |
| `listFiles(directory, serverId)` | `directory = '/', serverId?: string` | `Promise<Object>` | Lists files and directories in remote directory. |
| `getFileContents(filePath, serverId)` | `filePath: string, serverId?: string` | `Promise<string>` | Reads raw text content of remote file. |
| `writeFile(filePath, content, serverId)` | `filePath: string, content: string, serverId?: string` | `Promise<Object>` | Writes raw text content to remote file. |
| `backupFile(filePath, serverId)` | `filePath: string, serverId?: string` | `Promise<Object>` | Creates backup copy `<filePath>.bak`. |
| `rollbackFile(filePath, serverId)` | `filePath: string, serverId?: string` | `Promise<Object>` | Restores file from `<filePath>.bak`. |
| `getUploadUrl(serverId)` | `serverId?: string` | `Promise<string>` | Requests temporary signed upload URL from Pterodactyl daemon. |
| `uploadFile(remoteDir, localFilePath, serverId)` | `remoteDir = '/', localFilePath: string, serverId?: string` | `Promise<Object>` | Uploads local file using multipart FormData to signed upload URL. |

---

### 3. Library Reference: `Diagnostics` (`scripts/lib/diagnostics.js`)

Log analysis and pattern matching module for Minecraft server failures:

| Function | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `detectIssues(rawLogs)` | `rawLogs: string \| string[]` | `Array<Issue>` | Analyzes raw log text and returns matched Minecraft error signatures. |
| `parseLogLines(rawLogs, options)` | `rawLogs: string \| string[], options: { filter, maxLines }` | `Array<string>` | Filters log lines by level (`all`, `error`, `warn`). |
| `formatDiagnosticReport(issues)` | `issues: Array<Issue>` | `string` | Formats detected issues into structured Markdown with remediation steps. |

#### Detected Issue Signatures:
- **`PORT_BIND_ERROR` (FATAL):** `BindException: Address already in use` or `FAILED TO BIND TO PORT`.
- **`JAVA_VERSION_MISMATCH` (FATAL):** `UnsupportedClassVersionError` (plugin compiled with newer Java version than server runtime).
- **`MISSING_DEPENDENCY` (CRITICAL):** `UnknownDependencyException` / `CannotLoadException` (required plugin missing).
- **`OUT_OF_MEMORY` (FATAL):** `OutOfMemoryError: Java heap space` or `GC overhead limit exceeded`.
- **`WATCHDOG_FREEZE` (CRITICAL):** `Server hang watch dog` / thread dump server freeze.
- **`GEYSER_NETHERNET_MISMATCH` (CRITICAL):** Bedrock Terracotta error / NetherNet transport failure.
- **`CONFIG_SYNTAX_ERROR` (CRITICAL):** YAML `ScannerException` / `YAMLException` indentation error.
- **`PLUGIN_INIT_ERROR` (WARNING):** `Error occurred while enabling <Plugin>` during `onEnable()`.

---

### 4. Library Reference: `ConfigEditor` (`scripts/lib/config-editor.js`)

Safe configuration modifier preserving indentation, comments, and structure:

| Function | Parameters | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `parseProperties(text)` | `text: string` | `Record<string, string>` | Parses Java `server.properties` into key-value object. |
| `patchProperties(originalText, updates)` | `originalText: string, updates: Record<string, string>` | `string` | In-place patches properties without stripping `#` comments. |
| `patchYamlKey(yamlText, dotPath, newValue)` | `yamlText: string, dotPath: string, newValue: any` | `string` | In-place patches nested YAML key (e.g., `bedrock.transport`) preserving exact spacing. |
| `createDiff(originalText, updatedText, fileName)` | `originalText: string, updatedText: string, fileName?: string` | `string` | Generates Git-style Unified Diff (`-` and `+`) preview. |

---

## Installation & Getting Started

### 1. Requirements
- **Node.js** v18.0.0 or higher (v20+ / v25+ recommended).
- **Pterodactyl Client API Key (`ptlc_...`)**: Generate from your Pterodactyl Panel under *Account Settings* -> *API Credentials*.

### 2. Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate your credentials in `.env`:
```env
PTERO_URL=https://panel.example.com
PTERO_CLIENT_KEY=ptlc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PTERO_SERVER_ID=xxxxxxxx
```

### 3. Running Unit Tests (TDD)
The project comes with a zero-dependency test suite utilizing Node.js native test runner:
```bash
npm test
```

---

## Integration with AI Coding Agents

This skill is designed for instant drop-in integration across multiple AI Agents:

- **Google Antigravity:** Place this directory into `~/.gemini/skills/minecraft-aiops` or use directly in workspace. Antigravity reads operational SOP from `SKILL.md`.
- **Claude Code:** Keep in workspace root; Claude Code reads SOP and executes CLI subcommands via shell tool.
- **Cursor / Codex:** Reference `SKILL.md` as project rules context for server operations and diagnostics.

---

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.
