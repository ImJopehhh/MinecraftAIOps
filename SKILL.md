---
name: minecraft-aiops
description: Autonomous SRE and DevOps assistant for Minecraft server management, diagnostics, and optimization via Pterodactyl Client API. Universal for Antigravity, Claude Code, Cursor, Codex, and all CLI AI agents.
---

# Minecraft AIOps - Autonomous SRE Skill

This skill equips any AI Agent to manage, analyze, troubleshoot, and optimize Minecraft servers (Paper, Purpur, Velocity) hosted on **Pterodactyl** panel autonomously using a user-level **Pterodactyl Client API Key (`ptlc_...`)**.

---

## 1. Onboarding & Credential Verification

Before executing any commands, verify that a `.env` file exists and is populated in the workspace root:
- `PTERO_URL`: Pterodactyl panel URL (e.g., `https://panel.example.com`).
- `PTERO_CLIENT_KEY`: User Client API Key (starts with `ptlc_`).
- `PTERO_SERVER_ID`: Default short server identifier (optional, can be overridden per command).

> [!IMPORTANT]
> If `.env` is missing or credentials are unpopulated:
> 1. Do not proceed to diagnostics blindly.
> 2. Ask the user for their panel URL and API Key politely:
>    *"Please generate an API Key in your Pterodactyl Panel (Click Account Avatar -> Account Settings -> API Credentials -> Create New). Provide your Panel URL and Client API Key (`ptlc_...`) here."*
> 3. Write credentials into the local `.env` file. Never leak or print `.env` contents to public logs or output.

---

## 2. Triage & Diagnostic Workflow (SOP)

When a user reports server issues (lag, crashes, players unable to connect, or plugin failures), follow this strict 3-step investigation order:

### Step 1: Runtime Health Check
Inspect the server's real-time state:
```bash
node scripts/ptero.js usage
```
- Observe `State` (`running`, `starting`, `offline`), `CPU Usage (%)`, and `Memory`.
- If RAM reaches 95–100%, consider a memory leak or undersized heap allocation.

### Step 2: Intelligent Log Diagnostics
Run the diagnostic pattern-matching engine:
```bash
node scripts/ptero.js diagnose
```
This automatically maps errors to common root cause categories:
- **`PORT_BIND_ERROR`**: Main server port or plugin listener (Geyser, VoiceChat, NuVotifier) already in use.
- **`JAVA_VERSION_MISMATCH`**: Java version in Docker startup image is too old for compiled plugin bytecode.
- **`MISSING_DEPENDENCY`**: Plugin requires a missing dependency (e.g., Vault, ProtocolLib).
- **`OUT_OF_MEMORY`**: Heap space exhausted.
- **`WATCHDOG_FREEZE`**: Server thread hung due to synchronous blocking tasks or heavy chunk ticking.
- **`GEYSER_NETHERNET_MISMATCH`**: Bedrock Terracotta error caused by NetherNet WebRTC/UDP transport failure.
- **`CONFIG_SYNTAX_ERROR`**: YAML indentation error or tab characters in configuration.

### Step 3: Specifications & Port Allocations
If the issue pertains to networking or connectivity:
```bash
node scripts/ptero.js info
```
Verify the `Allocations (Ports)` list. Ensure ports defined in `server.properties` or plugin configs match active Pterodactyl allocations assigned by the hosting provider.

---

## 3. Safe Execution Protocols & Guardrails

### A. Mandatory Safe Config Editing
Never overwrite configuration files arbitrarily. Use built-in patchers that automatically generate `.bak` copies:
- For Java Properties (`server.properties`):
  ```bash
  node scripts/ptero.js patch-prop server.properties <key> <value>
  ```
- For YAML files (`paper-world-defaults.yml`, `config.yml`):
  ```bash
  node scripts/ptero.js patch-yaml <path/file.yml> <dotPath> <value>
  ```
  *Example (Fixing Geyser Terracotta error):*
  ```bash
  node scripts/ptero.js patch-yaml plugins/Geyser-Spigot/config.yml bedrock.transport raknet
  ```

### B. Power Action Confirmation Guardrail
- **NEVER** run `node scripts/ptero.js power stop` or `power kill` without explicit user confirmation.
- Clearly explain why a restart or stop is required before asking:
  *"Configuration changes have been applied. May I restart the server now to load the new settings?"*

---

## 4. Multi-Layer Verification SOP

After applying any fix or change, the AI **must actively verify** success rather than assuming it worked:

1. **Passive Log Check:**
   Read the 50 most recent log lines:
   ```bash
   node scripts/ptero.js logs --filter=error --lines=50
   ```
   Confirm that previously detected exceptions are absent from new log output.
2. **Active Console Probe:**
   Send a probe command to test plugin status:
   ```bash
   node scripts/ptero.js cmd "plugins"
   ```
   Confirm that the target plugin is listed as active (green).
3. **Stability & Health Probe:**
   Re-check resource metrics:
   ```bash
   node scripts/ptero.js usage
   ```
   Confirm server remains in `RUNNING` state and CPU is not pegged at 100%.
4. **Auto-Rollback on Failure:**
   If the server enters a crash loop or throws new fatal errors, immediately restore the configuration:
   ```bash
   node scripts/ptero.js rollback <path/file>
   ```
   Report the failure transparently to the user with root cause details.
