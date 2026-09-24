import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = fileURLToPath(new URL('../theme/scss/gdm.scss', import.meta.url));
const outputPath = fileURLToPath(new URL('../build/theme/gdm.css', import.meta.url));
const checkOnly = process.argv.includes('--check');
const unknownArguments = process.argv.slice(2).filter(argument => argument !== '--check');

if (unknownArguments.length > 0) {
  throw new Error(`unknown argument: ${unknownArguments[0]}`);
}

const result = await sass.compileAsync(sourcePath, {
  charset: false,
  sourceMap: false,
  style: 'expanded',
});
const css = `${result.css.trimEnd()}\n`;

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

  console.log(`Validated ${relative(projectRoot, outputPath)}`);
} else {
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;

  await mkdir(dirname(outputPath), { recursive: true });

  try {
    await writeFile(temporaryPath, css, 'utf8');
    await rename(temporaryPath, outputPath);
  } finally {
    await unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }

  console.log(`Compiled ${relative(projectRoot, sourcePath)} to ${relative(projectRoot, outputPath)}`);
}
