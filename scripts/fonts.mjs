#!/usr/bin/env node
// Download a Google Fonts family into a brand's fonts/ folder and register it in tokens.json,
// so rendering never needs the network.
//
// Usage:
//   node fonts.mjs --family "Fraunces" --weights 400,600 [--italic] --role heading (--brand <slug> | --brand-dir <path>)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir } from './lib/workspace.mjs';

const args = parseArgs();
const family = args.family;
const role = args.role;
if (!family || !role || family === true || role === true) fail('usage: fonts.mjs --family "<Google font>" --weights 400,700 [--italic] --role <heading|body|accent> (--brand <slug> | --brand-dir <path>)');
const weights = String(args.weights || '400').split(',').map(w => w.trim()).filter(Boolean);
const italic = !!args.italic;

const brandDir = resolveBrandDir(args, resolveWorkspace(args));
const axis = italic
  ? `ital,wght@${[...weights.map(w => `0,${w}`), ...weights.map(w => `1,${w}`)].join(';')}`
  : `wght@${weights.join(';')}`;
const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}`;

// Without a browser user agent Google serves one full .ttf per style, which is what we want.
const res = await fetch(url);
if (!res.ok) fail(`Google Fonts returned ${res.status} for ${family} (${weights.join(', ')}${italic ? ' + italic' : ''}). Check the family name and that those weights exist.\n${url}`);
const css = await res.text();

const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  style: body.match(/font-style:\s*(\w+)/)?.[1] || 'normal',
  weight: body.match(/font-weight:\s*([\d ]+);/)?.[1].trim() || '400',
  src: body.match(/url\(([^)]+)\)/)?.[1],
})).filter(f => f.src);
if (!faces.length) fail(`no font files found in Google Fonts response for ${family}`);

const fontsDir = path.join(brandDir, 'fonts');
fs.mkdirSync(fontsDir, { recursive: true });
const slug = family.replace(/[^A-Za-z0-9]+/g, '');
const files = [];
for (const f of faces) {
  const ext = path.extname(new URL(f.src).pathname) || '.ttf';
  const name = `${slug}-${f.weight.replace(/\s+/g, '_')}${f.style === 'italic' ? '-italic' : ''}${ext}`;
  const r = await fetch(f.src);
  if (!r.ok) fail(`download failed (${r.status}): ${f.src}`);
  fs.writeFileSync(path.join(fontsDir, name), Buffer.from(await r.arrayBuffer()));
  files.push({ path: `fonts/${name}`, weight: Number(f.weight) || f.weight, style: f.style });
  console.log(`  saved fonts/${name}`);
}

const tokensFile = path.join(brandDir, 'tokens.json');
const tokens = readJSON(tokensFile, {});
tokens.fonts ??= {};
const prev = tokens.fonts[role];
const keep = prev?.family === family ? (prev.files || []).filter(p => !files.some(f => f.path === p.path)) : [];
tokens.fonts[role] = { ...(prev?.family === family ? prev : {}), family, source: 'google', files: [...keep, ...files] };
writeJSON(tokensFile, tokens);
console.log(`Registered "${family}" as the ${role} font in ${tokensFile}`);
