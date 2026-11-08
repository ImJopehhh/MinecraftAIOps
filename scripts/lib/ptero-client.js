/**
 * Pterodactyl Client API Wrapper (Native ESM & Fetch)
 * Handles client-level operations without requiring administrative or root panel keys.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load environment variables from .env file if process.env is not already populated.
 */
export function loadEnv(envPath = resolve(__dirname, '../../.env')) {
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  return env;
}

export class PteroClient {
  constructor(options = {}) {
    loadEnv();
    this.baseUrl = (options.url || process.env.PTERO_URL || '').replace(/\/+$/, '');
    this.apiKey = options.apiKey || process.env.PTERO_CLIENT_KEY || '';
    this.defaultServerId = options.serverId || process.env.PTERO_SERVER_ID || '';
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  getHeaders(extraHeaders = {}) {
    if (!this.apiKey) {
      throw new Error('PTERO_CLIENT_KEY is missing. Configure it in .env or via options.');
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  resolveServerId(serverId) {
    const id = serverId || this.defaultServerId;
    if (!id) {
      throw new Error('Server ID is required. Pass serverId or set PTERO_SERVER_ID in .env.');
    }
    return id;
  }

  async request(endpoint, options = {}) {
    if (!this.baseUrl) {
      throw new Error('PTERO_URL is missing. Configure it in .env or via options.');
    }
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = options.rawBody
      ? this.getHeaders({ 'Content-Type': 'text/plain' })
      : this.getHeaders(options.headers);

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.rawBody !== undefined ? options.rawBody : (options.body ? JSON.stringify(options.body) : undefined),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        parsedErr = errText;
      }
      const err = new Error(`Pterodactyl API error (${response.status} ${response.statusText}): ${JSON.stringify(parsedErr)}`);
      err.status = response.status;
      err.details = parsedErr;
      throw err;
    }

    if (options.asText) {
      return response.text();
    }
    if (response.status === 204) {
      return { success: true };
    }
    return response.json();
  }

  /**
   * Get server details, allocations, limits, and feature flags.
   */
  async getServerDetails(serverId) {
    const id = this.resolveServerId(serverId);
    return this.request(`/api/client/servers/${id}`);
  }

  /**
   * Get real-time resource utilization (CPU %, RAM bytes, Disk bytes, Uptime, State).
   */
  async getServerUsage(serverId) {
    const id = this.resolveServerId(serverId);
    return this.request(`/api/client/servers/${id}/resources`);
  }

  /**
   * Send console command to the server.
   */
  async sendCommand(command, serverId) {
    const id = this.resolveServerId(serverId);
    if (!command) throw new Error('Command cannot be empty.');
    return this.request(`/api/client/servers/${id}/command`, {
      method: 'POST',
      body: { command },
    });
  }

  /**
   * Send power action signal: 'start', 'stop', 'restart', 'kill'.
   */
  async setPowerState(signal, serverId) {
    const id = this.resolveServerId(serverId);
    const validSignals = ['start', 'stop', 'restart', 'kill'];
    if (!validSignals.includes(signal)) {
      throw new Error(`Invalid power signal '${signal}'. Must be one of: ${validSignals.join(', ')}`);
    }
    return this.request(`/api/client/servers/${id}/power`, {
      method: 'POST',
      body: { signal },
    });
  }

  /**
   * List files in a remote directory.
   */
  async listFiles(directory = '/', serverId) {
    const id = this.resolveServerId(serverId);
    const encDir = encodeURIComponent(directory);
    return this.request(`/api/client/servers/${id}/files/list?directory=${encDir}`);
  }

  /**
   * Read raw text content of a remote file.
   */
  async getFileContents(filePath, serverId) {
    const id = this.resolveServerId(serverId);
    const encFile = encodeURIComponent(filePath);
    return this.request(`/api/client/servers/${id}/files/contents?file=${encFile}`, {
      asText: true,
      headers: { 'Accept': 'text/plain' },
    });
  }

  /**
   * Write raw text content to a remote file.
   */
  async writeFile(filePath, content, serverId) {
    const id = this.resolveServerId(serverId);
    const encFile = encodeURIComponent(filePath);
    return this.request(`/api/client/servers/${id}/files/write?file=${encFile}`, {
      method: 'POST',
      rawBody: content,
    });
  }

  /**
   * Create an automatic backup of a remote file (<filePath>.bak).
   */
  async backupFile(filePath, serverId) {
    const id = this.resolveServerId(serverId);
    const originalContent = await this.getFileContents(filePath, id);
    const backupPath = `${filePath}.bak`;
    await this.writeFile(backupPath, originalContent, id);
    return { original: filePath, backup: backupPath, size: originalContent.length };
  }

  /**
   * Restore file from its backup (<filePath>.bak -> <filePath>).
   */
  async rollbackFile(filePath, serverId) {
    const id = this.resolveServerId(serverId);
    const backupPath = `${filePath}.bak`;
    const backupContent = await this.getFileContents(backupPath, id);
    await this.writeFile(filePath, backupContent, id);
    return { restored: filePath, from: backupPath };
  }

  /**
   * Fetch signed upload URL for files.
   */
  async getUploadUrl(serverId) {
    const id = this.resolveServerId(serverId);
    const res = await this.request(`/api/client/servers/${id}/files/upload`);
    return res?.attributes?.url;
  }

  /**
   * Upload a local file to remote directory using signed upload URL.
   */
  async uploadFile(remoteDirectory = '/', localFilePath, serverId) {
    const id = this.resolveServerId(serverId);
    const uploadUrl = await this.getUploadUrl(id);
    if (!uploadUrl) throw new Error('Failed to retrieve signed upload URL from panel.');

    const fileBuffer = readFileSync(localFilePath);
    const fileName = localFilePath.split(/[/|\\]/).pop();

    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('files', blob, fileName);

    const targetUrl = `${uploadUrl}&directory=${encodeURIComponent(remoteDirectory)}`;
    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload failed (${res.status} ${res.statusText}): ${errText}`);
    }

    return { success: true, file: fileName, directory: remoteDirectory };
  }
}

