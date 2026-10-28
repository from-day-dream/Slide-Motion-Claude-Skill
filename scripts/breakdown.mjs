#!/usr/bin/env node
// Reference breakdown: turns a reference video (or a folder of frames/stills) into material Claude can
// read to learn layouts, treatments and rhythm (references/breakdown.md):
//   contact.png       frames every 0.25s (or every still), with their times
//   motion-strip.png  how much changes between consecutive frames: a bar per step (tall = big move or
//                     cut) over a row of difference thumbnails (bright = where the motion is)
//   breakdown.json    times, change per step, likely cuts and still stretches
//
// Usage: node breakdown.mjs <video | image folder> [--out <dir>] [--every 0.25]
//
// Exit codes: 0 ok; 2 usage error or unreadable input.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { SKILL_DIR, parseArgs, fail, writeJSON } from './lib/workspace.mjs';

const require = createRequire(path.join(SKILL_DIR, 'package.json'));
const args = parseArgs();
const input = args._[0] ? path.resolve(args._[0]) : fail('usage: breakdown.mjs <video | image folder> [--out <dir>] [--every 0.25]', 2);
if (!fs.existsSync(input)) fail(`not found: ${input}`, 2);
const every = Number(args.every) || 0.25;
const out = path.resolve(typeof args.out === 'string' ? args.out : `${input.replace(/\.[^.\\/]+$/, '')}-breakdown`);
const framesDir = path.join(out, 'frames');
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

// 1. Frames: sample the video, or take the folder's images in name order.
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
let frames, isVideo = fs.statSync(input).isFile() && !IMAGE.test(input);
if (isVideo) {
  try {
    execFileSync(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', `fps=${1 / every},scale=360:-2`, '-q:v', '3', path.join(framesDir, '%04d.jpg')]);
  } catch (e) { fail(`ffmpeg could not read ${input}: ${String(e.stderr || e.message).slice(0, 300)}`, 2); }
  frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort().map((f, i) => ({ file: path.join(framesDir, f), t: +(i * every).toFixed(2) }));
} else {
  const files = fs.statSync(input).isFile() ? [input] : fs.readdirSync(input).filter(f => IMAGE.test(f)).sort().map(f => path.join(input, f));
  frames = [];
  for (const [i, f] of files.entries()) {
    const dest = path.join(framesDir, `${String(i + 1).padStart(4, '0')}.jpg`);
    await sharp(f).resize(360).jpeg({ quality: 85 }).toFile(dest);
    frames.push({ file: dest, t: null, source: path.basename(f) });
  }
}
if (!frames.length) fail('no frames found', 2);

// 2. Contact sheet with time labels.
const meta = await sharp(frames[0].file).metadata();
const tw = 180, th = Math.round(tw * meta.height / meta.width), gap = 10, perRow = 8, lab = 22;
const label = s => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${lab}"><text x="2" y="16" font-family="sans-serif" font-size="14" fill="#ddd">${s}</text></svg>`);
const tiles = [];
for (const [i, f] of frames.entries()) {
  const left = gap + (i % perRow) * (tw + gap), top = gap + Math.floor(i / perRow) * (th + lab + gap);
  tiles.push({ input: await sharp(f.file).resize(tw, th).toBuffer(), left, top: top + lab });
  tiles.push({ input: label(f.t !== null ? `${f.t.toFixed(2)}s` : f.source.slice(0, 22)), left, top });
}
const rows = Math.ceil(frames.length / perRow);
await sharp({ create: { width: gap + Math.min(frames.length, perRow) * (tw + gap), height: gap + rows * (th + lab + gap), channels: 3, background: '#111' } })
  .composite(tiles).png().toFile(path.join(out, 'contact.png'));

// 3. Change between consecutive frames (videos only): mean abs difference on small greyscale frames,
//    plus a difference thumbnail per step.
const report = { input, every: isVideo ? every : null, frames: frames.length, duration: isVideo ? +(frames.length * every).toFixed(2) : null, steps: [], cuts: [], still: [] };
if (isVideo && frames.length > 1) {
  const small = f => sharp(f).resize(90, Math.round(90 * meta.height / meta.width)).greyscale().raw().toBuffer({ resolveWithObject: true });
  let prev = await small(frames[0].file);
  const diffs = [];
  for (let i = 1; i < frames.length; i++) {
    const cur = await small(frames[i].file);
    const d = Buffer.alloc(cur.data.length);
    let sum = 0;
    for (let p = 0; p < d.length; p++) { const v = Math.abs(cur.data[p] - prev.data[p]); d[p] = Math.min(255, v * 3); sum += v; }
    diffs.push({ t: frames[i].t, change: +(sum / d.length).toFixed(2), img: { data: d, info: cur.info } });
    prev = cur;
  }
  const sorted = diffs.map(d => d.change).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
  report.steps = diffs.map(({ t, change }) => ({ t, change }));
  // A cut: a jump well above the typical change. Still: change near zero for 0.5s or more.
  report.cuts = diffs.filter(d => d.change > Math.max(20, median * 4)).map(d => d.t);
  let run = null;
  for (const d of diffs) {
    if (d.change < 1) run ??= d.t - every;
    else if (run !== null) { if (d.t - every - run >= 0.5) report.still.push([+run.toFixed(2), +(d.t - every).toFixed(2)]); run = null; }
  }
  if (run !== null && report.duration - run >= 0.5) report.still.push([+run.toFixed(2), report.duration]);
  report.cutsPerSecond = +(report.cuts.length / report.duration).toFixed(2);

  // Strip: bars on top (scaled to the largest change), difference thumbnails below, one column per step.
  const cw = 60, ch = Math.round(cw * meta.height / meta.width), barH = 120, max = Math.max(1, ...diffs.map(d => d.change));
  const bars = diffs.map((d, i) => `<rect x="${i * cw + 6}" y="${barH - Math.round((d.change / max) * (barH - 20))}" width="${cw - 12}" height="${Math.round((d.change / max) * (barH - 20))}" fill="${report.cuts.includes(d.t) ? '#ff5a5a' : '#9ad'}"/>${i % 4 === 0 ? `<text x="${i * cw + 2}" y="12" font-family="sans-serif" font-size="11" fill="#aaa">${d.t}s</text>` : ''}`).join('');
  const W = diffs.length * cw;
  const strip = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${barH}">${bars}</svg>`), left: 0, top: 0 }];
  for (const [i, d] of diffs.entries()) strip.push({ input: await sharp(d.img.data, { raw: { width: d.img.info.width, height: d.img.info.height, channels: 1 } }).resize(cw, ch).png().toBuffer(), left: i * cw, top: barH });
  await sharp({ create: { width: W, height: barH + ch, channels: 3, background: '#111' } }).composite(strip).png().toFile(path.join(out, 'motion-strip.png'));
}
writeJSON(path.join(out, 'breakdown.json'), report);
console.log(`Breakdown of ${path.basename(input)}: ${frames.length} frames${isVideo ? `, ${report.duration}s, ${report.cuts.length} likely cuts (${report.cutsPerSecond}/s), ${report.still.length} still stretches` : ''}
Contact sheet: ${path.join(out, 'contact.png')}${isVideo ? `\nMotion strip: ${path.join(out, 'motion-strip.png')}` : ''}
Data: ${path.join(out, 'breakdown.json')}
Next: read it per references/breakdown.md and save a recipe to brands/<slug>/recipes/<name>.json`);
