#!/usr/bin/env node
// Start a motion project from a Carousel Studio carousel. The carousel supplies the content (copy,
// images, caption, strategy) and its aesthetic (slide HTML copied to carousel-aesthetic/ as a look
// reference). The video's sequences and motion are planned fresh as one composition, in the brand's
// own motion language, never by re-laying out the slides.
//
// Usage:
//   node from-carousel.mjs <carousel-dir | folder name in <ws>/output | latest> [--ratio 9:16] [--duration 15]
//                          [--workspace <path>]
//
// Writes <ws>/motion/<date>-<slug>-<ratio>/ with images/, carousel-aesthetic/, caption.txt and meta.json
// (`content`: one entry per slide), then prints the content's word counts against the read budget.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir } from './lib/workspace.mjs';
import { resolveRatio, ratioTag, loadMotion, readSlide, targetDuration, DEFAULT_RATIO } from './lib/motion.mjs';

const args = parseArgs();
const target = args._[0] || fail('usage: from-carousel.mjs <carousel-dir | name | latest> [--ratio 9:16] [--duration 15]');

function findCarousel(spec) {
  if (fs.existsSync(path.join(spec, 'slides'))) return path.resolve(spec);
  const out = path.join(resolveWorkspace(args), 'output');
  if (!fs.existsSync(out)) fail(`no carousel at "${spec}" and no ${out}`);
  const dirs = fs.readdirSync(out, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(out, d.name, 'slides')))
    .map(d => ({ name: d.name, mtime: fs.statSync(path.join(out, d.name)).mtimeMs }));
  if (spec === 'latest') {
    if (!dirs.length) fail(`no carousels in ${out}`);
    return path.join(out, dirs.sort((a, b) => b.mtime - a.mtime)[0].name);
  }
  const hit = dirs.find(d => d.name === spec) || dirs.find(d => d.name.includes(spec));
  if (!hit) fail(`no carousel matching "${spec}" in ${out}`);
  return path.join(out, hit.name);
}

const words = s => (s ? s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0);

const src = findCarousel(target);
const ws = resolveWorkspace(args, src);
const meta = readJSON(path.join(src, 'meta.json'), {});
const brandDir = resolveBrandDir(args, ws, src);
const opt = k => (typeof args[k] === 'string' ? args[k] : undefined);
const motion = loadMotion(brandDir, null, { strict: false });  // may not be set up yet
const words_ = motion?.visual.wordsPerBeat ?? 7, reading = motion?.readingSpeed ?? 3.5;
const ratio = resolveRatio(typeof args.ratio === 'string' ? args.ratio : DEFAULT_RATIO);
const duration = targetDuration(args);

const slideFiles = fs.readdirSync(path.join(src, 'slides')).filter(f => /^\d+\.html$/.test(f)).sort();
if (!slideFiles.length) fail(`no slides in ${path.join(src, 'slides')}`);

const today = new Date().toISOString().slice(0, 10);
const base = `${today}-${path.basename(src).replace(/^\d{4}-\d{2}-\d{2}-/, '')}-${ratioTag(ratio.name)}`;
const motionRoot = path.join(ws, 'motion');
let name = base;
for (let i = 2; fs.existsSync(path.join(motionRoot, name)); i++) name = `${base}-${i}`;
const out = path.join(motionRoot, name);
fs.mkdirSync(out, { recursive: true });

let images = 0;
if (fs.existsSync(path.join(src, 'images'))) {
  fs.mkdirSync(path.join(out, 'images'), { recursive: true });
  for (const f of fs.readdirSync(path.join(src, 'images'))) {
    const s = path.join(src, 'images', f);
    if (fs.statSync(s).isFile()) { fs.copyFileSync(s, path.join(out, 'images', f)); images++; }
  }
}
// The slides themselves, for their look only: textures, rules, emphasis treatment, colour use.
fs.mkdirSync(path.join(out, 'carousel-aesthetic'), { recursive: true });
for (const f of slideFiles) fs.copyFileSync(path.join(src, 'slides', f), path.join(out, 'carousel-aesthetic', f));
if (fs.existsSync(path.join(src, 'caption.txt'))) fs.copyFileSync(path.join(src, 'caption.txt'), path.join(out, 'caption.txt'));

// Content inventory: what each slide says. Not a layout, and not yet a scene list.
const content = slideFiles.map((f, i) => {
  const n = i + 1;
  const fromHtml = readSlide(fs.readFileSync(path.join(src, 'slides', f), 'utf8'));
  const planned = (meta.slides || []).find(s => s.n === n) || {};
  const c = {
    slide: n, role: n === 1 ? 'hook' : n === slideFiles.length ? 'cta' : 'body',
    idea: planned.idea || '',
    headline: planned.headline || fromHtml.headline,
    emphasis: fromHtml.emphasis,
    key: planned.key ?? fromHtml.key,
    support: planned.support ?? fromHtml.support,
    items: planned.items?.length ? planned.items : fromHtml.items,
    image: planned.image?.file || fromHtml.image,
  };
  c.words = words(c.headline) + words(c.key) + words(c.support) + c.items.reduce((s, it) => s + words(it), 0);
  return c;
});

writeJSON(path.join(out, 'meta.json'), {
  brand: path.basename(brandDir), ratio: ratio.name, duration, createdAt: new Date().toISOString(),
  topic: meta.topic || '', title: meta.title || '', framework: meta.framework || '',
  source: { type: 'carousel', carousel: path.relative(ws, src).replace(/\\/g, '/'), slides: slideFiles.length },
  positioning: meta.positioning || '', context: meta.context || {},
  caption: meta.caption || '', hashtags: meta.hashtags || [],
  content,
  plan: null,
});

// Read budget: words on screen per read moment (the brand's cap), and roughly how many read moments
// the length allows when each needs its reading time plus room for the motion around it.
const fits = words_;
const beats = Math.max(2, Math.round(duration / (fits / reading + 1.2)));

console.log(`Motion project: ${out}`);
console.log(`From carousel:  ${src}  (${slideFiles.length} slides, ${images} image file(s) copied)`);
console.log(`Ratio ${ratio.name} (${ratio.width}×${ratio.height}) · brand ${path.basename(brandDir)}${motion ? '' : ' (motion not set up yet: run the motion setup before rendering)'}\n`);
for (const c of content) {
  const flag = c.words > fits ? `  ← trim to ≤ ${fits}` : '';
  console.log(`${String(c.slide).padStart(2, '0')} ${c.role.padEnd(5)} ${String(c.words).padStart(3)} words${flag}   ${c.headline}`);
}
console.log(`\nTarget ${duration}s ≈ ${beats} read moments, each with ≤ ${fits} words on screen.`);
console.log('Content only: cut and recombine it into core ideas, then plan the video as one composition (meta.json → plan).');
console.log('carousel-aesthetic/ holds the slides as a look reference (textures, rules, emphasis, colour use), not as layouts.');
