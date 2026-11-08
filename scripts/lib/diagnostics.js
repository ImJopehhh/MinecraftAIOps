/**
 * Minecraft Log & Diagnostic Parser
 * Extracts errors, stack traces, and identifies root causes for Paper/Purpur/Velocity servers.
 */

export const ISSUE_SIGNATURES = [
  {
    type: 'PORT_BIND_ERROR',
    severity: 'FATAL',
    name: 'Port Already In Use',
    pattern: /(?:java\.net\.BindException:\s*(?:Address already in use|Permission denied)|FAILED TO BIND TO PORT|The exception was:\s*io\.netty\.channel\.unix\.Errors\$NativeIoException:\s*bind\(\.\.\)\s*failed)/i,
    description: 'Server failed to bind network port because it is already occupied by another process or blocked by firewall.',
    remediation: 'Check server-port in server.properties or listener ports for Geyser/VoiceChat. Verify against Pterodactyl allocations and ensure no zombie processes exist.'
  },
  {
    type: 'JAVA_VERSION_MISMATCH',
    severity: 'FATAL',
    name: 'Java Runtime Mismatch',
    pattern: /java\.lang\.UnsupportedClassVersionError:.*has been compiled by a more recent version of the Java Runtime \(class file version (\d+)\.0\), this version of the Java Runtime only recognizes class file versions up to (\d+)\.0/i,
    description: 'Plugin was compiled with a newer Java version than the Java runtime executing on the server.',
    remediation: 'Upgrade Java Docker image in Pterodactyl Startup configuration (e.g., from Java 17 to Java 21) or install a compatible plugin build.'
  },
  {
    type: 'MISSING_DEPENDENCY',
    severity: 'CRITICAL',
    name: 'Missing Plugin Dependency',
    pattern: /(?:UnknownDependencyException:\s*([\w\-]+)|Could not load 'plugins[/\\]([\w\-\.]+)' in folder 'plugins':\s*org\.bukkit\.plugin\.UnknownDependencyException:\s*([\w\-]+)|CannotLoadException:.*Unknown dependency:\s*([\w\-]+))/i,
    description: 'Plugin failed to initialize because a required dependency (such as Vault, ProtocolLib, DecentHolograms) is missing.',
    remediation: 'Download and place the required dependency plugin into the plugins/ folder.'
  },
  {
    type: 'OUT_OF_MEMORY',
    severity: 'FATAL',
    name: 'Out of Memory (OOM)',
    pattern: /java\.lang\.OutOfMemoryError:\s*(?:Java heap space|GC overhead limit exceeded|Metaspace)/i,
    description: 'RAM allocation exhausted. Java Heap Space is full and Garbage Collector cannot free enough memory.',
    remediation: 'Increase server memory allocation in panel, or reduce simulation-distance and configure entity limits in paper-world-defaults.yml.'
  },
  {
    type: 'HIKARICP_STARVATION',
    severity: 'CRITICAL',
    name: 'HikariCP Pool Starvation / Database Timeout',
    pattern: /(?:HikariPool-[\w\-]+ - Connection is not available, request timed out after \d+ms|java\.sql\.SQLTransientConnectionException: HikariPool)/i,
    description: 'Database connection pool exhausted. Active connections are deadlocked or queries are taking too long to return to the pool.',
    remediation: 'Inspect slow queries in database, check MySQL max_connections limit, or increase maximumPoolSize and connectionTimeout in plugin configuration.'
  },
  {
    type: 'SQLITE_LOCK',
    severity: 'CRITICAL',
    name: 'SQLite Database Busy / Locked',
    pattern: /(?:\[SQLITE_BUSY\]\s*The database file is locked|org\.sqlite\.SQLiteException:\s*\[SQLITE_BUSY\])/i,
    description: 'Multiple concurrent threads attempted to write to an SQLite database file without Write-Ahead Logging (WAL) enabled.',
    remediation: 'Ensure plugin is configured with journal_mode=WAL or migrate high-traffic plugin data to MySQL/MariaDB.'
  },
  {
    type: 'NETTY_BUFFER_LEAK',
    severity: 'FATAL',
    name: 'Netty Direct Memory Buffer Leak',
    pattern: /(?:io\.netty\.util\.internal\.OutOfDirectMemoryError|LEAK:\s*ByteBuf\.release\(\)\s*was not called)/i,
    description: 'Netty direct memory leak detected. Packet handler or packet injection plugin failed to release ByteBuf buffers.',
    remediation: 'Update packet-level plugins (e.g., ProtocolLib, PacketEvents, ViaVersion) to their latest builds.'
  },
  {
    type: 'CORRUPTED_CHUNK',
    severity: 'CRITICAL',
    name: 'Corrupted World Chunk / RegionFile',
    pattern: /(?:RegionFile .* is corrupted|Chunk file at .* is corrupted|Wrong location in world!|Corrupt chunk detected)/i,
    description: 'World chunk region file header is corrupted, usually due to an abrupt server kill (SIGKILL) or sudden disk unmount.',
    remediation: 'Restore corrupted region file from world backup, or run MCA Selector / Region-Fixer to prune damaged chunk headers.'
  },
  {
    type: 'WATCHDOG_FREEZE',
    severity: 'CRITICAL',
    name: 'Watchdog Freeze (Server Hang)',
    pattern: /(?:A single server tick took \d+ seconds|The server has stopped responding! This is \(probably\) not a Paper bug|Server hang watch dog)/i,
    description: 'Server froze exceeding watchdog threshold. Main server thread is blocked by slow database queries, disk I/O, or infinite loops.',
    remediation: 'Analyze thread dump in log to identify blocking operations (often synchronous MySQL queries, slow network requests, or excessive chunk ticking).'
  },
  {
    type: 'GEYSER_NETHERNET_MISMATCH',
    severity: 'CRITICAL',
    name: 'Geyser NetherNet / Terracotta Error',
    pattern: /(?:Failed to bind NetherNet|InitialConnection-149|NetherNet transport error|Cannot assign requested address.*19132)/i,
    description: 'Bedrock client fails to connect with Terracotta error due to NetherNet port collision with Java, unallocated secondary port, or missing public advertise-addresses behind Docker container.',
    remediation: 'In plugins/Geyser-Spigot/config.yml: 1) Set bedrock.clone-remote-port: false (NetherNet requires separate port from Java). 2) Assign a dedicated secondary port allocated in Pterodactyl. 3) Configure advertise-addresses with public IP:Port so containerized Docker IP is not sent to clients. 4) Ensure hosting provider allows both TCP (signaling) and UDP (WebRTC) on that port.'
  },
  {
    type: 'CONFIG_SYNTAX_ERROR',
    severity: 'CRITICAL',
    name: 'YAML/Config Syntax Error',
    pattern: /(?:org\.yaml\.snakeyaml\.scanner\.ScannerException|YAMLException:\s*while scanning|could not parse configuration file)/i,
    description: 'Syntax or indentation error encountered while parsing YAML configuration file.',
    remediation: 'Check indentation (avoid tabs), or restore the configuration file from backup (.bak).'
  },
  {
    type: 'PLUGIN_INIT_ERROR',
    severity: 'WARNING',
    name: 'Plugin Enabling Failed',
    pattern: /Error occurred while enabling ([\w\-]+) v[\d\.\-]+ \(Is it up to date\?\)/i,
    description: 'Plugin threw an uncaught exception during onEnable() execution.',
    remediation: 'Inspect stack trace below the error line to identify the exact code line or missing resource causing the failure.'
  }
];

/**
 * Filter and extract relevant log lines.
 */
export function parseLogLines(rawLogs, options = {}) {
  if (!rawLogs) return [];
  const lines = typeof rawLogs === 'string' ? rawLogs.split(/\r?\n/) : rawLogs;
  const filter = options.filter || 'all'; // 'all', 'error', 'warn'
  const maxLines = options.maxLines || lines.length;

  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isError = /(?:\[[^\]]*\b(?:ERROR|FATAL|SEVERE)\b[^\]]*\]|\b(?:ERROR|FATAL|SEVERE)\b:|Exception in thread|Caused by:|\tat )/i.test(line);
    const isWarn = /(?:\[[^\]]*\b(?:WARN|WARNING)\b[^\]]*\]|\b(?:WARN|WARNING)\b:)/i.test(line);

    if (filter === 'error' && isError) {
      result.push(line);
    } else if (filter === 'warn' && (isError || isWarn)) {
      result.push(line);
    } else if (filter === 'all') {
      result.push(line);
    }
  }

  return result.slice(-maxLines);
}

/**
 * Extract thread metadata and execution context from log line.
 */
export function extractThreadContext(line) {
  if (!line) return { thread: 'Unknown', isMainThread: false, level: 'INFO' };
  const match = line.match(/\[([^/\]]+)\/([A-Z]+)\]/);
  if (match) {
    const thread = match[1].trim();
    const isMainThread = /Server thread/i.test(thread);
    return {
      thread,
      isMainThread,
      level: match[2],
    };
  }
  return { thread: 'Unknown', isMainThread: false, level: 'INFO' };
}

/**
 * Detect specific issue signatures from raw log text.
 */
export function detectIssues(rawLogs) {
  if (!rawLogs) return [];
  const text = typeof rawLogs === 'string' ? rawLogs : rawLogs.join('\n');
  const detected = [];

  for (const sig of ISSUE_SIGNATURES) {
    const match = text.match(sig.pattern);
    if (match) {
      detected.push({
        type: sig.type,
        name: sig.name,
        severity: sig.severity,
        description: sig.description,
        remediation: sig.remediation,
        matchedSnippet: match[0].trim(),
      });
    }
  }

  return detected;
}

/**
 * Format detected issues into a clean Markdown report.
 */
export function formatDiagnosticReport(issues) {
  if (!issues || issues.length === 0) {
    return '✅ **Diagnostic Result:** No critical errors or crash signatures found in recent logs.';
  }

  let report = `### ⚠️ Server Diagnostic Report (${issues.length} Issue(s) Detected)\n\n`;
  for (const item of issues) {
    report += `#### [${item.severity}] ${item.name} (${item.type})\n`;
    report += `- **Description:** ${item.description}\n`;
    report += `- **Log Snippet:** \`${item.matchedSnippet}\`\n`;
    report += `- **Recommended Action:** ${item.remediation}\n\n`;
  }

  return report.trim();
}
