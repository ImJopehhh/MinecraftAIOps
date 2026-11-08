import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProperties, patchProperties, patchYamlKey, createDiff } from '../scripts/lib/config-editor.js';

test('config-editor: parseProperties correctly parses key-value pairs', () => {
  const content = `
# Minecraft server properties
server-port=25565
online-mode=true
motd=A Minecraft Server
`;
  const parsed = parseProperties(content);
  assert.equal(parsed['server-port'], '25565');
  assert.equal(parsed['online-mode'], 'true');
  assert.equal(parsed['motd'], 'A Minecraft Server');
});

test('config-editor: patchProperties updates existing keys and preserves comments', () => {
  const original = `
# Server Configuration
server-port=25565
online-mode=true
`;
  const patched = patchProperties(original, { 'server-port': '25577', 'view-distance': '8' });
  assert.match(patched, /# Server Configuration/);
  assert.match(patched, /server-port=25577/);
  assert.match(patched, /online-mode=true/);
  assert.match(patched, /view-distance=8/);
});

test('config-editor: patchYamlKey updates nested keys while preserving comments', () => {
  const originalYaml = `
bedrock:
  address: 0.0.0.0
  port: 19132
  clone-remote-port: true # default clone
remote:
  address: auto
`;

  const updatedYaml = patchYamlKey(originalYaml, 'bedrock.clone-remote-port', 'false');
  assert.match(updatedYaml, /clone-remote-port:\s*false\s*# default clone/);
  assert.match(updatedYaml, /port:\s*19132/);
});

test('config-editor: createDiff outputs unified diff correctly', () => {
  const textA = 'server-port=25565\nonline-mode=true';
  const textB = 'server-port=25577\nonline-mode=true';
  const diff = createDiff(textA, textB, 'server.properties');
  assert.match(diff, /- server-port=25565/);
  assert.match(diff, /\+ server-port=25577/);
});

