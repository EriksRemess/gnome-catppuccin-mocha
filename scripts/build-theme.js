import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorThemeDirectory = join(projectRoot, 'vendor/gnome-shell-theme');
const themeSourceDirectory = join(projectRoot, 'theme/scss');
const outputDirectory = join(projectRoot, 'build/theme');
const checkOnly = process.argv.includes('--check');
const unknownArguments = process.argv.slice(2).filter(argument => argument !== '--check');

if (unknownArguments.length > 0) {
  throw new Error(`unknown argument: ${unknownArguments[0]}`);
}

const stylesheets = [
  ['theme/scss/gdm.scss', 'gdm.css'],
  ['vendor/gnome-shell-theme/gnome-shell-dark.scss', 'gnome-shell-dark.css'],
  ['vendor/gnome-shell-theme/gnome-shell-high-contrast.scss', 'gnome-shell-high-contrast.css'],
  ['vendor/gnome-shell-theme/gnome-shell-light.scss', 'gnome-shell-light.css'],
];

function replaceShellAccentColors(css) {
  const marker = css.match(/Catppuccin Mocha GDM theme; accent: (#[0-9a-f]{6}); accent-fg: (#[0-9a-f]{6});/i);

  if (!marker) {
    throw new Error('the Catppuccin stylesheet is missing its compiled accent marker');
  }

  const [, accent, accentForeground] = marker;
  return css
    .replaceAll('-st-accent-fg-color', accentForeground)
    .replaceAll('-st-accent-color', accent);
}

async function compile(sourceRelativePath) {
  const result = await sass.compileAsync(join(projectRoot, sourceRelativePath), {
    charset: false,
    loadPaths: [vendorThemeDirectory, themeSourceDirectory],
    silenceDeprecations: ['color-functions', 'global-builtin', 'if-function', 'import', 'slash-div'],
    sourceMap: false,
    style: 'expanded',
  });

  const css = sourceRelativePath === 'theme/scss/gdm.scss'
    ? replaceShellAccentColors(result.css)
    : result.css;

  return `${css.trimEnd()}\n`;
}

async function writeAtomic(path, contents) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }
}

for (const [sourceRelativePath, outputName] of stylesheets) {
  const outputPath = join(outputDirectory, outputName);
  const css = await compile(sourceRelativePath);

  if (checkOnly) {
    let existing;

    try {
      existing = await readFile(outputPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`missing ${relative(projectRoot, outputPath)}; run npm run build`);
      }

      throw error;
    }

    if (existing !== css) {
      throw new Error(`${relative(projectRoot, outputPath)} is stale; run npm run build`);
    }
  } else {
    await writeAtomic(outputPath, css);
    console.log(`Compiled ${sourceRelativePath} to ${relative(projectRoot, outputPath)}`);
  }
}

if (checkOnly) {
  console.log(`Validated ${stylesheets.length} compiled stylesheets`);
}
