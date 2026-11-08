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
    description: 'Bedrock client disconnects with Terracotta error due to NetherNet WebRTC/TCP protocol mismatch or missing port allocations.',
    remediation: 'Open plugins/Geyser-Spigot/config.yml, change transport: nethernet to transport: raknet, or ensure both TCP and UDP ports are allocated in Pterodactyl.'
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
