import { execFile } from 'node:child_process';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  formatFileDifferences,
  hashDirectory,
  requiredUpstreamFiles,
  sha256,
} from './lib/upstream.js';

const run = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorDirectory = join(projectRoot, 'vendor/gnome-shell-theme');
const metadataPath = join(projectRoot, 'upstream.json');
const arguments_ = process.argv.slice(2);
let ref = '50.1';

for (let index = 0; index < arguments_.length; index += 1) {
  if (arguments_[index] !== '--ref') {
    throw new Error(`unknown argument: ${arguments_[index]}`);
  }

  if (!arguments_[index + 1] || arguments_[index + 1].startsWith('--')) {
    throw new Error('--ref requires a value');
  }

  ref = arguments_[index + 1];
  index += 1;
}

async function fetchChecked(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      'User-Agent': 'gdm-catppuccin-mocha-updater',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`download failed (${response.status} ${response.statusText}): ${url}`);
  }

  return response;
}

async function verifyExistingVendor() {
  let metadata;

  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  const differences = formatFileDifferences(metadata.files, await hashDirectory(vendorDirectory));

  if (differences.length > 0) {
    throw new Error(
      `refusing to replace a modified upstream snapshot:\n${differences.map(line => `  ${line}`).join('\n')}`,
    );
  }
}

await verifyExistingVendor();

const commitResponse = await fetchChecked(
  `https://api.github.com/repos/GNOME/gnome-shell/commits/${encodeURIComponent(ref)}`,
  'application/vnd.github+json',
);
const commit = (await commitResponse.json()).sha;

if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error(`GitHub returned an invalid commit for ${ref}`);
}

const archiveResponse = await fetchChecked(
  `https://codeload.github.com/GNOME/gnome-shell/tar.gz/${commit}`,
  'application/gzip',
);
const archive = Buffer.from(await archiveResponse.arrayBuffer());
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gdm-catppuccin-upstream-'));
const archivePath = join(temporaryDirectory, 'gnome-shell.tar.gz');
const extractDirectory = join(temporaryDirectory, 'extract');
const stagedVendor = join(dirname(vendorDirectory), `.gnome-shell-theme.next-${process.pid}`);
const backupVendor = join(dirname(vendorDirectory), `.gnome-shell-theme.old-${process.pid}`);
const temporaryMetadata = `${metadataPath}.${process.pid}.tmp`;

try {
  await writeFile(archivePath, archive);
  await mkdir(extractDirectory);
  await run('tar', ['-xzf', archivePath, '-C', extractDirectory]);

  const archiveRoot = join(extractDirectory, `gnome-shell-${commit}`);
  const upstreamTheme = join(archiveRoot, 'data/theme');

  for (const path of requiredUpstreamFiles) {
    await readFile(join(upstreamTheme, path));
  }

  await mkdir(dirname(vendorDirectory), { recursive: true });
  await cp(upstreamTheme, stagedVendor, { recursive: true, errorOnExist: true });

  const files = await hashDirectory(stagedVendor);
  const metadata = {
    schemaVersion: 1,
    repository: 'https://gitlab.gnome.org/GNOME/gnome-shell',
    mirror: 'https://github.com/GNOME/gnome-shell',
    ref,
    commit,
    archiveSha256: sha256(archive),
    files,
  };

  await writeFile(temporaryMetadata, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  let hadVendor = false;
  try {
    await rename(vendorDirectory, backupVendor);
    hadVendor = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await rename(stagedVendor, vendorDirectory);
    await rename(temporaryMetadata, metadataPath);
  } catch (error) {
    await rm(vendorDirectory, { recursive: true, force: true });
    if (hadVendor) {
      await rename(backupVendor, vendorDirectory);
    }
    throw error;
  }

  await rm(backupVendor, { recursive: true, force: true });
  console.log(`Updated ${relative(projectRoot, vendorDirectory)} from ${ref} (${commit})`);
  console.log('Review the upstream diff, then run: make check');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
  await rm(stagedVendor, { recursive: true, force: true });
  await rm(temporaryMetadata, { force: true });
}
