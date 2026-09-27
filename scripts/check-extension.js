import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const extensionDirectory = join(projectRoot, 'extension');
const expectedUuid = 'catppuccin-mocha@gnome-catppuccin-mocha';
const metadata = JSON.parse(
  await readFile(join(extensionDirectory, 'metadata.json'), 'utf8'),
);

if (metadata.uuid !== expectedUuid) {
  throw new Error(`extension UUID must be ${expectedUuid}`);
}

if (!metadata['shell-version']?.includes('50')) {
  throw new Error('extension must support GNOME Shell 50');
}

for (const mode of ['user', 'unlock-dialog']) {
  if (!metadata['session-modes']?.includes(mode)) {
    throw new Error(`extension does not support required session mode: ${mode}`);
  }
}

const source = await readFile(join(extensionDirectory, 'extension.js'), 'utf8');
for (const requiredCall of [
  'Main.sessionMode.connect',
  'Main.setThemeStylesheet',
  'Main.loadTheme',
]) {
  if (!source.includes(requiredCall)) {
    throw new Error(`extension is missing required integration: ${requiredCall}`);
  }
}

console.log(`Validated ${expectedUuid} for user and unlock-dialog modes`);
