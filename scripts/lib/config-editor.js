/**
 * Minecraft Safe Config Editor
 * Parses, patches, and creates diffs for server.properties, YAML, and TOML configs.
 * Preserves comments, indentation, and structure.
 */

/**
 * Parse Java properties format (server.properties).
 */
export function parseProperties(text) {
  const result = {};
  if (!text) return result;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

/**
 * Patch Java properties in-place, preserving comments and line order.
 */
export function patchProperties(originalText, updates = {}) {
  if (!originalText && Object.keys(updates).length === 0) return '';
  const lines = (originalText || '').split(/\r?\n/);
  const updatedKeys = new Set();
  const newLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      newLines.push(line);
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim();
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        newLines.push(`${key}=${updates[key]}`);
        updatedKeys.add(key);
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  // Append keys that weren't in the original file
  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${val}`);
    }
  }

  return newLines.join('\n');
}

/**
 * Patch YAML key-value pair taking hierarchy/dot-path into account (e.g. 'bedrock.transport').
 * Operates on lines directly to preserve all comments and formatting.
 */
export function patchYamlKey(yamlText, dotPath, newValue) {
  if (!yamlText) return `${dotPath}: ${newValue}\n`;
  const parts = dotPath.split('.');
  const lines = yamlText.split(/\r?\n/);

  let currentPartIndex = 0;
  let targetIndent = 0;
  let lineReplaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    const currentKey = parts[currentPartIndex];
    const keyRegex = new RegExp(`^${currentKey}\\s*:`);

    if (keyRegex.test(trimmed)) {
      if (indent === targetIndent) {
        if (currentPartIndex === parts.length - 1) {
          // Found the leaf node to update
          const prefix = line.match(/^(\s*[\w\-]+\s*:\s*)/)[1];
          // Check for trailing comment
          const commentMatch = line.match(/(\s+#.*)$/);
          const trailingComment = commentMatch ? commentMatch[1] : '';
          lines[i] = `${prefix}${newValue}${trailingComment}`;
          lineReplaced = true;
          break;
        } else {
          // Matched an intermediate parent node
          currentPartIndex++;
          targetIndent = indent + 2; // assume standard 2-space indentation
        }
      }
    }
  }

  if (!lineReplaced) {
    // If key not found, append safely at the end or report
    throw new Error(`Key path '${dotPath}' was not found in the YAML structure.`);
  }

  return lines.join('\n');
}

/**
 * Create a simple Unified Diff string between original and updated text.
 */
export function createDiff(originalText, updatedText, fileName = 'file') {
  const origLines = (originalText || '').split(/\r?\n/);
  const newLines = (updatedText || '').split(/\r?\n/);
  const diff = [`--- a/${fileName}`, `+++ b/${fileName}`];

  let hasChanges = false;
  const max = Math.max(origLines.length, newLines.length);

  for (let i = 0; i < max; i++) {
    const oldLine = origLines[i];
    const newLine = newLines[i];

    if (oldLine !== newLine) {
      hasChanges = true;
      if (oldLine !== undefined) diff.push(`- ${oldLine}`);
      if (newLine !== undefined) diff.push(`+ ${newLine}`);
    }
  }

  if (!hasChanges) return 'No changes detected.';
  return diff.join('\n');
}

