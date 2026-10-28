#!/usr/bin/env node
// Background removal for library images (the hero cutout orbit, cut-outs in front of type). Runs a
// segmentation model (BiRefNet on fal, config/cutout.json), cleans the mask (slight erode + feather), and
// saves images/cutouts/<id>.png with alpha beside the library, recording it as the entry's `cutout`.
// Paid and off by default: --check costs nothing; a real run needs --yes, given only after the user agreed.
// Third-party images keep their rights: a cutout of an image that isn't approved still needs the user's yes.
//
// Usage:
//   node cutout.mjs <motion-dir> --check [--ids 03,07]
//   node cutout.mjs <motion-dir> --ids 03,07 --yes [--erode 1.5] [--feather 1]
//
// Exit codes: 0 ok; 1 a cutout failed; 2 usage/config error (no key, no --yes, unknown id).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace, stripComments } from './lib/workspace.mjs';

const args = parseArgs();
const dir = args._[0] ? path.resolve(args._[0]) : fail('usage: cutout.mjs <motion-dir> --check | --ids 03,07 --yes', 2);
const ws = resolveWorkspace(args, dir);
dotenv.config({ path: path.join(ws, '.env'), quiet: true });
const cfg = { ...stripComments(readJSON(path.join(SKILL_DIR, 'config', 'cutout.json'))), ...stripComments(readJSON(path.join(ws, 'cutout.json'), {})) };
const libFile = path.join(dir, 'images', 'library.json');
const lib = readJSON(libFile, null) || fail(`no image library in ${dir} - run ingest.mjs or library.mjs first`, 2);
const ids = typeof args.ids === 'string' ? args.ids.split(',').map(s => s.trim()) : [];
const picked = ids.length ? ids.map(id => lib.images.find(e => e.id === id) || fail(`no library image with id ${id}`, 2)) : [];
const key = process.env[cfg.keyEnv];

if (args.check) {
  console.log(JSON.stringify({
    provider: cfg.provider, endpoint: cfg.endpoint, keyFound: !!key, paid: true, cost: cfg.cost,
    images: picked.map(e => ({ id: e.id, file: e.file, rights: e.rights, approved: e.approved, cutout: e.cutout || null })),
    decision: !key ? `no ${cfg.keyEnv} in ${path.join(ws, '.env')} - cutouts unavailable; use a framed or masked photo instead` : 'ask the user before running (paid); then run with --ids … --yes',
  }, null, 2));
  process.exit(0);
}
if (!picked.length) fail('--ids is required (library ids, e.g. 03,07)', 2);
if (!args.yes) fail('cutouts are paid: run with --check, ask the user, then add --yes', 2);
if (!key) fail(`no ${cfg.keyEnv} in ${path.join(ws, '.env')}`, 2);

const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
async function http(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${String(typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 300)}`);
  return body;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function segment(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  const input = { ...cfg.input, image_url: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
  const sub = await http(`${cfg.queueUrl}/${cfg.endpoint}`, { method: 'POST', headers, body: JSON.stringify(input) });
  const status = sub.status_url || `${cfg.queueUrl}/${cfg.endpoint}/requests/${sub.request_id}/status`;
  const result = sub.response_url || `${cfg.queueUrl}/${cfg.endpoint}/requests/${sub.request_id}`;
  for (const start = Date.now(); ;) {
    const st = await http(status, { headers });
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.error) throw new Error(`fal job failed: ${JSON.stringify(st.error || st).slice(0, 300)}`);
    if (Date.now() - start > 5 * 60 * 1000) throw new Error('fal job did not finish within 5 minutes');
    await sleep(2000);
  }
  const out = await http(result, { headers });
  const url = out.image?.url || out.images?.[0]?.url;
  if (!url) throw new Error(`no image in the response: ${JSON.stringify(out).slice(0, 300)}`);
  if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Shrink the mask slightly (no halo of the old background) and soften its edge.
async function clean(rgbaPng, original, erode, feather) {
  const { width, height } = await sharp(original).metadata();
  const one = { raw: { width, height, channels: 1 } };
  // Work on the alpha as a raw single band (sharp's blur would otherwise widen it to RGB).
  const band = img => img.extractChannel(0).raw().toBuffer();
  let mask = await sharp(rgbaPng).resize(width, height).ensureAlpha().extractChannel(3).raw().toBuffer();
  if (erode > 0) mask = await band(sharp(await band(sharp(mask, one).blur(Math.max(0.3, erode))), one).linear(2, -255));
  if (feather > 0) mask = await band(sharp(mask, one).blur(Math.max(0.3, feather)));
  const rgb = await sharp(original).removeAlpha().toBuffer();
  return sharp(rgb).joinChannel(mask, one).png().toBuffer();
}

const erode = args.erode !== undefined ? Number(args.erode) : cfg.cleanup.erode;
const feather = args.feather !== undefined ? Number(args.feather) : cfg.cleanup.feather;
const outDir = path.join(dir, 'images', 'cutouts');
fs.mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const e of picked) {
  try {
    const src = path.join(dir, e.file);
    const raw = await segment(src);
    const out = path.join(outDir, `${e.id}.png`);
    fs.writeFileSync(out, await clean(raw, src, erode, feather));
    e.cutout = path.relative(dir, out).replace(/\\/g, '/');
    console.log(`${e.id}: ${e.cutout}${e.rights !== 'own' && !e.approved ? '  (third-party: needs the user\'s yes before use)' : ''}`);
  } catch (err) {
    failed++;
    console.error(`${e.id}: ${err.message}`);
  }
}
writeJSON(libFile, lib);
process.exit(failed ? 1 : 0);
