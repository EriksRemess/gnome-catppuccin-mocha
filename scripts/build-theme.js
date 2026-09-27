import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorThemeDirectory = join(projectRoot, 'vendor/gnome-shell-theme');
const themeSourceDirectory = join(projectRoot, 'theme/scss');
const checkOnly = process.argv.includes('--check');
const unknownArguments = process.argv.slice(2).filter(argument => argument !== '--check');

if (unknownArguments.length > 0) {
  throw new Error(`unknown argument: ${unknownArguments[0]}`);
}

const stylesheets = [
  {
    source: 'theme/scss/gnome-shell.scss',
    outputs: [
      'build/theme/gdm.css',
      'build/user-theme/catppuccin-mocha/gnome-shell/gnome-shell.css',
    ],
    replaceAccentColors: true,
  },
  {
    source: 'theme/scss/gtk-3.0.scss',
    outputs: ['build/desktop/gtk-3.0/gtk.css'],
  },
  {
    source: 'theme/scss/gtk-4.0.scss',
    outputs: ['build/desktop/gtk-4.0/gtk.css'],
  },
  {
    source: 'vendor/gnome-shell-theme/gnome-shell-dark.scss',
    outputs: ['build/theme/gnome-shell-dark.css'],
  },
  {
    source: 'vendor/gnome-shell-theme/gnome-shell-high-contrast.scss',
    outputs: ['build/theme/gnome-shell-high-contrast.css'],
  },
  {
    source: 'vendor/gnome-shell-theme/gnome-shell-light.scss',
    outputs: ['build/theme/gnome-shell-light.css'],
  },
];

function replaceShellAccentColors(css) {
  const marker = css.match(/Catppuccin Mocha GNOME Shell theme; accent: (#[0-9a-f]{6}); accent-fg: (#[0-9a-f]{6});/i);

  if (!marker) {
    throw new Error('the Catppuccin stylesheet is missing its compiled accent marker');
  }

  const [, accent, accentForeground] = marker;
  return css
    .replaceAll('-st-accent-fg-color', accentForeground)
    .replaceAll('-st-accent-color', accent);
}

async function compile(stylesheet) {
  const result = await sass.compileAsync(join(projectRoot, stylesheet.source), {
    charset: false,
    loadPaths: [vendorThemeDirectory, themeSourceDirectory],
    silenceDeprecations: ['color-functions', 'global-builtin', 'if-function', 'import', 'slash-div'],
    sourceMap: false,
    style: 'expanded',
  });

  const css = stylesheet.replaceAccentColors
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

let outputCount = 0;

for (const stylesheet of stylesheets) {
  const css = await compile(stylesheet);

  for (const outputRelativePath of stylesheet.outputs) {
    const outputPath = join(projectRoot, outputRelativePath);
    outputCount += 1;

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
      console.log(`Compiled ${stylesheet.source} to ${outputRelativePath}`);
    }
  }
}

if (checkOnly) {
  console.log(`Validated ${outputCount} generated stylesheets`);
}
