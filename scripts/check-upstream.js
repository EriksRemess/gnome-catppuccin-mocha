import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatFileDifferences,
  hashDirectory,
  requiredUpstreamFiles,
} from './lib/upstream.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorDirectory = join(projectRoot, 'vendor/gnome-shell-theme');
const metadata = JSON.parse(await readFile(join(projectRoot, 'upstream.json'), 'utf8'));

if (metadata.schemaVersion !== 1 || !/^[0-9a-f]{40}$/.test(metadata.commit)) {
  throw new Error('upstream.json has an unsupported or invalid format');
}

for (const path of requiredUpstreamFiles) {
  if (!(path in metadata.files)) {
    throw new Error(`upstream.json does not track required file: ${path}`);
  }
}

const differences = formatFileDifferences(metadata.files, await hashDirectory(vendorDirectory));
if (differences.length > 0) {
  throw new Error(`vendored GNOME source differs from upstream.json:\n${differences.map(line => `  ${line}`).join('\n')}`);
}

function topLevelRules(css) {
  const rules = [];
  let buffer = '';
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];

    if (inComment) {
      if (character === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && character === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (depth === 0) buffer += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      if (depth === 0) buffer += character;
    } else if (character === '{') {
      if (depth === 0) {
        rules.push(buffer.trim().replace(/\s+/g, ' '));
        buffer = '';
      }
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('compiled CSS contains an unmatched closing brace');
      if (depth === 0) buffer = '';
    } else if (depth === 0 && character === ';') {
      buffer = '';
    } else if (depth === 0) {
      buffer += character;
    }
  }

  if (depth !== 0 || quote || inComment) {
    throw new Error('compiled CSS is syntactically incomplete');
  }

  return rules;
}

const customCss = await readFile(join(projectRoot, 'build/theme/gdm.css'), 'utf8');
const userThemeCss = await readFile(
  join(projectRoot, 'build/user-theme/catppuccin-mocha/gnome-shell/gnome-shell.css'),
  'utf8',
);
const stockCss = await readFile(join(projectRoot, 'build/theme/gnome-shell-dark.css'), 'utf8');
const customRules = topLevelRules(customCss);
const stockRules = topLevelRules(stockCss);

if (customCss !== userThemeCss) {
  throw new Error('GDM and user Shell stylesheets were not generated from identical source');
}

if (JSON.stringify(customRules) !== JSON.stringify(stockRules)) {
  const firstDifferentRule = customRules.findIndex((rule, index) => rule !== stockRules[index]);
  const mismatch = firstDifferentRule === -1
    ? Math.min(customRules.length, stockRules.length)
    : firstDifferentRule;
  throw new Error(
    `Catppuccin and upstream selector structure differ at rule ${mismatch + 1}:\n` +
    `  Catppuccin: ${customRules[mismatch] ?? '<missing>'}\n` +
    `  upstream:   ${stockRules[mismatch] ?? '<missing>'}`,
  );
}

const forbiddenColors = [
  '#222226', '#36363a', '#fafafb',
  '#99c1f1', '#62a0ea', '#3584e4', '#1c71d8', '#1a5fb4',
  '#8ff0a4', '#57e389', '#33d17a', '#2ec27e', '#26a269',
  '#f9f06b', '#f8e45c', '#f6d32d', '#f5c211', '#e5a50a',
  '#ffbe6f', '#ffa348', '#ff7800', '#e66100', '#c64600',
  '#f66151', '#ed333b', '#e01b24', '#c01c28', '#a51d2d',
  '#dc8add', '#c061cb', '#9141ac', '#813d9c', '#613583',
  '#cdab8f', '#b5835a', '#986a44', '#865e3c', '#63452c',
  '#f6f5f4', '#deddda', '#c0bfbc', '#9a9996',
  '#77767b', '#5e5c64', '#3d3846', '#241f31', '#cd9309',
];
const lowerCustomCss = customCss.toLowerCase();
const remainingColors = forbiddenColors.filter(color => lowerCustomCss.includes(color));

if (remainingColors.length > 0) {
  throw new Error(`gdm.css contains unmapped GNOME colors: ${remainingColors.join(', ')}`);
}

if (/-st-accent-(?:fg-)?color/.test(customCss)) {
  throw new Error('gdm.css contains an unmapped GNOME Shell accent color');
}

for (const color of ['#1e1e2e', '#cba6f7', '#cdd6f4']) {
  if (!lowerCustomCss.includes(color)) {
    throw new Error(`gdm.css is missing required Catppuccin color: ${color}`);
  }
}

console.log(
  `Validated GNOME Shell ${metadata.ref} source at ${metadata.commit.slice(0, 12)} ` +
  `and ${customRules.length} CSS rules`,
);
