import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const requiredUpstreamFiles = [
  'calendar-today-light.svg',
  'calendar-today.svg',
  'gnome-shell-dark.scss',
  'gnome-shell-high-contrast.scss',
  'gnome-shell-light.scss',
  'gnome-shell-sass/_colors.scss',
  'gnome-shell-sass/_common.scss',
  'gnome-shell-sass/_default-colors.scss',
  'gnome-shell-sass/_drawing.scss',
  'gnome-shell-sass/_palette.scss',
  'gnome-shell-sass/_widgets.scss',
  'gnome-shell-sass/widgets/_login-lock.scss',
  'gnome-shell-start.svg',
  'pad-osd.css',
  'workspace-placeholder.svg',
];

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(path, root));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }

  return files;
}

export async function hashDirectory(directory) {
  const hashes = {};

  for (const path of await listFiles(directory)) {
    hashes[path] = sha256(await readFile(join(directory, path)));
  }

  return hashes;
}

export function formatFileDifferences(expected, actual) {
  const differences = [];
  const paths = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

  for (const path of paths) {
    if (!(path in actual)) {
      differences.push(`missing: ${path}`);
    } else if (!(path in expected)) {
      differences.push(`unexpected: ${path}`);
    } else if (actual[path] !== expected[path]) {
      differences.push(`modified: ${path}`);
    }
  }

  return differences;
}
