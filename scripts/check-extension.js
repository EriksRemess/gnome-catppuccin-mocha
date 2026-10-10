import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const extensionDirectory = join(projectRoot, 'extension');
const expectedUuid = 'catppuccin-mocha@gnome-catppuccin-mocha';
const upstream = JSON.parse(
  await readFile(join(projectRoot, 'upstream.json'), 'utf8'),
);
const expectedShellVersion = upstream.ref.split('.')[0];
const metadata = JSON.parse(
  await readFile(join(extensionDirectory, 'metadata.json'), 'utf8'),
);

if (metadata.uuid !== expectedUuid) {
  throw new Error(`extension UUID must be ${expectedUuid}`);
}

if (!metadata['shell-version']?.includes(expectedShellVersion)) {
  throw new Error(
    `extension must support GNOME Shell ${expectedShellVersion} from upstream.json`,
  );
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

const configurationSource = await readFile(
  join(projectRoot, 'scripts/configure-extension.js'),
  'utf8',
);
for (const requiredIntegration of [
  'Gio.SettingsSchemaSource.get_default',
  'Gio.SettingsSchemaSource.new_from_directory',
  '/usr/share/glib-2.0/schemas',
]) {
  if (!configurationSource.includes(requiredIntegration)) {
    throw new Error(
      `extension configuration is missing required schema lookup: ${requiredIntegration}`,
    );
  }
}

console.log(`Validated ${expectedUuid} for user and unlock-dialog modes`);
