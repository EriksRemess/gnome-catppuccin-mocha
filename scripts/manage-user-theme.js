import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const themeName = 'catppuccin-mocha';
const markerName = '.gdm-catppuccin-mocha-managed.json';
const arguments_ = process.argv.slice(2);
const action = arguments_.shift();
let stagedHome;

if (!['install', 'uninstall'].includes(action)) {
  throw new Error('usage: manage-user-theme.js <install|uninstall> [--home DIRECTORY]');
}

while (arguments_.length > 0) {
  const argument = arguments_.shift();
  if (argument !== '--home') {
    throw new Error(`unknown argument: ${argument}`);
  }

  stagedHome = arguments_.shift();
  if (!stagedHome || stagedHome.startsWith('--')) {
    throw new Error('--home requires a directory');
  }
}

const userHome = resolve(stagedHome ?? homedir());
const dataHome = stagedHome
  ? join(userHome, '.local/share')
  : resolve(process.env.XDG_DATA_HOME ?? join(userHome, '.local/share'));
const configHome = stagedHome
  ? join(userHome, '.config')
  : resolve(process.env.XDG_CONFIG_HOME ?? join(userHome, '.config'));
const themeRoot = join(dataHome, 'themes');
const themeTarget = join(themeRoot, themeName);
const themeSource = join(projectRoot, 'build/user-theme', themeName);
const themeCssRelativePath = 'gnome-shell/gnome-shell.css';
const themeCssTarget = join(themeTarget, themeCssRelativePath);
const themeMarker = join(themeTarget, markerName);
const legacyTheme = join(userHome, '.themes', themeName);
const gtkFiles = [
  {
    source: join(projectRoot, 'build/desktop/gtk-3.0/gtk.css'),
    target: join(configHome, 'gtk-3.0/gtk.css'),
    marker: join(configHome, 'gtk-3.0/.catppuccin-mocha-gtk-css.sha256'),
  },
  {
    source: join(projectRoot, 'build/desktop/gtk-4.0/gtk.css'),
    target: join(configHome, 'gtk-4.0/gtk.css'),
    marker: join(configHome, 'gtk-4.0/.catppuccin-mocha-gtk-css.sha256'),
  },
];

if (basename(themeTarget) !== themeName || dirname(themeTarget) !== themeRoot) {
  throw new Error(`refusing unsafe theme target: ${themeTarget}`);
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function snapshotDirectory(directory, ignoreMarker = false) {
  const directories = [];
  const files = {};

  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(path, entry.name);
      const relativePath = relative(directory, entryPath);

      if (ignoreMarker && relativePath === markerName) continue;

      if (entry.isDirectory()) {
        directories.push(relativePath);
        await visit(entryPath);
      } else if (entry.isFile()) {
        files[relativePath] = sha256(await readFile(entryPath));
      } else {
        throw new Error(`unsupported entry in managed theme: ${entryPath}`);
      }
    }
  }

  await visit(directory);
  return { directories, files };
}

function snapshotDifferences(expected, actual) {
  const differences = [];
  const expectedDirectories = new Set(expected.directories);
  const actualDirectories = new Set(actual.directories);

  for (const path of [...expectedDirectories].sort()) {
    if (!actualDirectories.has(path)) differences.push(`missing directory: ${path}`);
  }
  for (const path of [...actualDirectories].sort()) {
    if (!expectedDirectories.has(path)) differences.push(`unexpected directory: ${path}`);
  }

  const paths = [...new Set([...Object.keys(expected.files), ...Object.keys(actual.files)])].sort();
  for (const path of paths) {
    if (!(path in actual.files)) differences.push(`missing file: ${path}`);
    else if (!(path in expected.files)) differences.push(`unexpected file: ${path}`);
    else if (actual.files[path] !== expected.files[path]) differences.push(`modified file: ${path}`);
  }

  return differences;
}

async function readThemeMarker() {
  const contents = await readOptional(themeMarker);
  if (!contents) return null;

  try {
    return JSON.parse(contents.toString('utf8'));
  } catch {
    throw new Error(`invalid managed-theme marker: ${themeMarker}`);
  }
}

async function verifyManagedTheme() {
  const marker = await readThemeMarker();
  if (!marker) {
    if (await exists(themeTarget)) {
      throw new Error(`refusing to replace unmanaged theme: ${themeTarget}`);
    }
    return false;
  }

  let expected;
  if (marker.schemaVersion === 1 && marker.theme === themeName && marker.cssSha256) {
    expected = {
      directories: ['gnome-shell'],
      files: { [themeCssRelativePath]: marker.cssSha256 },
    };
  } else if (
    marker.schemaVersion === 2 &&
    marker.theme === themeName &&
    Array.isArray(marker.directories) &&
    marker.files &&
    typeof marker.files === 'object'
  ) {
    expected = { directories: marker.directories, files: marker.files };
  } else {
    throw new Error(`refusing invalid managed-theme marker: ${themeMarker}`);
  }

  const differences = snapshotDifferences(expected, await snapshotDirectory(themeTarget, true));
  if (differences.length > 0) {
    throw new Error(
      `refusing to replace a modified managed theme:\n${differences.map(line => `  ${line}`).join('\n')}`,
    );
  }

  return true;
}

async function inspectManagedGtk(file) {
  const existing = await readOptional(file.target);
  const marker = await readOptional(file.marker);

  if (!existing) return { managed: false, markerExists: marker !== null };

  if (!marker || marker.toString('utf8').trim() !== sha256(existing)) {
    throw new Error(`refusing to replace unmanaged or modified GTK override: ${file.target}`);
  }

  return { managed: true, markerExists: true };
}

function transactionPaths(path, label) {
  return {
    staged: `${path}.${label}.next-${process.pid}`,
    previous: `${path}.${label}.old-${process.pid}`,
  };
}

async function removeFile(path) {
  await unlink(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function install() {
  if (!stagedHome && await exists(join(legacyTheme, themeCssRelativePath))) {
    throw new Error(
      `${legacyTheme} shadows ${themeTarget}; move or remove the legacy theme before installing`,
    );
  }

  const sourceSnapshot = await snapshotDirectory(themeSource);
  const sourceGtk = await Promise.all(gtkFiles.map(async file => ({
    ...file,
    contents: await readFile(file.source),
  })));
  const hadManagedTheme = await verifyManagedTheme();
  const gtkInspection = await Promise.all(gtkFiles.map(inspectManagedGtk));
  const themePaths = transactionPaths(themeTarget, 'install');
  const gtkState = sourceGtk.map((file, index) => ({
    ...file,
    ...gtkInspection[index],
    targetPaths: transactionPaths(file.target, 'install'),
    markerPaths: transactionPaths(file.marker, 'install'),
    targetBackedUp: false,
    markerBackedUp: false,
    targetInstalled: false,
    markerInstalled: false,
  }));
  let themeBackedUp = false;
  let themeInstalled = false;

  await mkdir(themeRoot, { recursive: true });

  try {
    await cp(themeSource, themePaths.staged, { recursive: true, errorOnExist: true });
    await writeFile(
      join(themePaths.staged, markerName),
      `${JSON.stringify({
        schemaVersion: 2,
        theme: themeName,
        directories: sourceSnapshot.directories,
        files: sourceSnapshot.files,
      }, null, 2)}\n`,
      'utf8',
    );

    for (const state of gtkState) {
      await mkdir(dirname(state.target), { recursive: true });
      await writeFile(state.targetPaths.staged, state.contents, { flag: 'wx' });
      await writeFile(state.markerPaths.staged, `${sha256(state.contents)}\n`, { flag: 'wx' });
    }

    if (hadManagedTheme) {
      await rename(themeTarget, themePaths.previous);
      themeBackedUp = true;
    }

    for (const state of gtkState) {
      if (state.managed) {
        await rename(state.target, state.targetPaths.previous);
        state.targetBackedUp = true;
      }
      if (state.markerExists) {
        await rename(state.marker, state.markerPaths.previous);
        state.markerBackedUp = true;
      }
    }

    await rename(themePaths.staged, themeTarget);
    themeInstalled = true;

    for (const state of gtkState) {
      await rename(state.targetPaths.staged, state.target);
      state.targetInstalled = true;
      await rename(state.markerPaths.staged, state.marker);
      state.markerInstalled = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    const rollback = async operation => {
      try {
        await operation();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    };

    for (const state of [...gtkState].reverse()) {
      if (state.markerInstalled) await rollback(() => removeFile(state.marker));
      if (state.targetInstalled) await rollback(() => removeFile(state.target));
      if (state.markerBackedUp) await rollback(() => rename(state.markerPaths.previous, state.marker));
      if (state.targetBackedUp) await rollback(() => rename(state.targetPaths.previous, state.target));
    }
    if (themeInstalled) await rollback(() => rm(themeTarget, { recursive: true, force: true }));
    if (themeBackedUp) await rollback(() => rename(themePaths.previous, themeTarget));

    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'installation failed and rollback was incomplete');
    }
    throw error;
  } finally {
    await rm(themePaths.staged, { recursive: true, force: true });
    for (const state of gtkState) {
      await removeFile(state.targetPaths.staged);
      await removeFile(state.markerPaths.staged);
    }
  }

  await rm(themePaths.previous, { recursive: true, force: true });
  for (const state of gtkState) {
    await removeFile(state.targetPaths.previous);
    await removeFile(state.markerPaths.previous);
  }

  console.log(`Installed GNOME Shell theme in ${themeTarget}`);
  console.log(`Installed GTK 3 and GTK 4 overrides in ${configHome}`);
  console.log(`Select “${themeName}” in the User Themes extension, then restart affected applications.`);
}

async function uninstall() {
  const managedTheme = await verifyManagedTheme();
  const gtkInspection = await Promise.all(gtkFiles.map(inspectManagedGtk));
  const themeRemoval = `${themeTarget}.uninstall-${process.pid}`;
  const gtkState = gtkFiles.map((file, index) => ({
    ...file,
    ...gtkInspection[index],
    targetRemoval: `${file.target}.uninstall-${process.pid}`,
    markerRemoval: `${file.marker}.uninstall-${process.pid}`,
    targetMoved: false,
    markerMoved: false,
  }));
  let themeMoved = false;

  try {
    if (managedTheme) {
      await rename(themeTarget, themeRemoval);
      themeMoved = true;
    }
    for (const state of gtkState) {
      if (state.managed) {
        await rename(state.target, state.targetRemoval);
        state.targetMoved = true;
      }
      if (state.markerExists) {
        await rename(state.marker, state.markerRemoval);
        state.markerMoved = true;
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...gtkState].reverse()) {
      try {
        if (state.markerMoved) await rename(state.markerRemoval, state.marker);
        if (state.targetMoved) await rename(state.targetRemoval, state.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      if (themeMoved) await rename(themeRemoval, themeTarget);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'uninstall failed and rollback was incomplete');
    }
    throw error;
  }

  if (themeMoved) await rm(themeRemoval, { recursive: true });
  for (const state of gtkState) {
    if (state.targetMoved) await removeFile(state.targetRemoval);
    if (state.markerMoved) await removeFile(state.markerRemoval);
  }

  console.log(`Removed managed user theme and GTK overrides from ${userHome}`);
  console.log('Select “Default” in the User Themes extension, then restart affected applications.');
}

if (action === 'install') await install();
else await uninstall();
