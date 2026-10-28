#!/usr/bin/env node
// composition.html -> MP4. A video is ONE HTML composition with ONE master GSAP timeline made of
// overlapping sequences (references/composition.md). The renderer seeks that timeline frame by frame
// in Playwright and pipes the frames into ffmpeg. Every read moment (labels hold, hold2…) gets
// Carousel Studio's layout, retention and contrast checks plus reading time; the whole timeline is
// checked for continuous motion, determinism and valid curves; cut labels (cut, cut2…) get a cut sheet.
// How things look and move comes only from the brand (motion.json, tokens) and the video's meta.json.
//
// Usage:
//   node render.mjs <motion-dir> [--ratio 9:16] [--duration 15] [--fps 30] [--draft] [--no-platform-safe]
//                   [--blur <samples>|auto] [--shutter 0-1]
//                   [--brand <slug> | --brand-dir <path>] [--workspace <path>]
//   node render.mjs --specimen [--brand <slug> | --brand-dir <path>]
//   node render.mjs --specimen <archetype|all> [--brand <slug> | --brand-dir <path>] [--out <dir>] [--draft]
//
// --specimen alone writes the brand's type specimen. With an archetype id (templates/archetypes/,
// references/layouts.md) it renders that archetype's structure template in the brand as a 3s clip,
// into <out>/<id>/ (default <brandDir>/specimens/); "all" renders every one plus archetypes.png.
//
// Motion blur: each video frame averages sub-frames over a shutter window (default --shutter 0.5,
// a 180° shutter). Stills (poster, storyboard, cuts, checks) are always single sharp frames.
//
// Outputs in <motion-dir>: video.mp4, poster.png (first read moment), storyboard.png (every read
// moment), cuts.png (frames around each cut label), png/read-NN.png, frames/, render-report.json.
//
// Exit codes: 0 = rendered, no errors; 1 = rendered, report has errors; 2 = fatal (fonts, motion tokens, files, ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import {
  SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir,
} from './lib/workspace.mjs';
import {
  inject, sourceChecks, measureInPage, retentionChecks, contrastChecks,
  openBrowser, loadAndVerify, FontError, contactSheet, printReport, context, renderSpecimen,
} from './lib/render-core.mjs';
import {
  resolveRatio, safeZone, loadMotion, motionHead, curvesIn, GSAP_FILES, targetDuration, DEFAULT_RATIO, fillPlaceholders,
} from './lib/motion.mjs';

const args = parseArgs();
const require = createRequire(path.join(SKILL_DIR, 'package.json'));

// ---------- source checks: everything must move on the seekable timeline ----------

function motionSourceChecks(html) {
  const errors = [], warnings = [];
  const css = [...(html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []), ...(html.match(/style\s*=\s*"[^"]*"/gi) || [])].join('\n');
  if (/@keyframes|(^|[;{\s"])animation(-name)?\s*:/m.test(css)) errors.push({ check: 'determinism', msg: 'CSS @keyframes/animation runs on the wall clock - animate with the GSAP timeline instead' });
  if (/(^|[;{\s"])transition\s*:\s*(?!none)/m.test(css)) errors.push({ check: 'determinism', msg: 'CSS transition fights the frame-by-frame seek - remove it and use the GSAP timeline' });
  if (/requestAnimationFrame|setTimeout|setInterval/.test(html)) errors.push({ check: 'determinism', msg: 'requestAnimationFrame/setTimeout/setInterval - all motion must live on window.__scene.tl' });
  if (/<(video|audio|iframe)\b/i.test(html)) errors.push({ check: 'determinism', msg: '<video>/<audio>/<iframe> cannot be seeked frame-accurately - use images' });
  if (/Math\.random/.test(html)) errors.push({ check: 'determinism', msg: 'Math.random makes every render different - use motionKit.rng(seed) or fixed values' });
  if (/motionKit\.(rng|noise)\(\s*\)/.test(html) || /motionKit\.(wobble|grain)\([^;]*?\{(?![^}]*\bseed\b)[^}]*\}/.test(html)) errors.push({ check: 'determinism', msg: 'a motionKit noise helper is called without a seed - pass a fixed numeric seed (motion-craft.md)' });
  if (!/window\.__scene\s*=/.test(html)) errors.push({ check: 'timeline', msg: 'scene never sets window.__scene = { tl }' });
  return { errors, warnings };
}

// Shapes (templates/shapes/) and textures (templates/textures/) a brand allows. design-language.md may say
//   Shapes: deny all  |  Shapes: allow star-5, blob-1  |  Textures: deny grain, gradient-mesh
// A missing line allows everything. Returns warnings for what the composition uses against those rules.
function assetChecks(html, brandDir, register) {
  const file = path.join(brandDir, 'design-language.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const rule = k => {
    const m = new RegExp(String.raw`^\s*[-*]?\s*\**${k}\**\s*:\s*\**\s*(allow|deny)\b\s*(.*)$`, 'im').exec(text);
    if (!m) return null;
    const list = m[2].split(/[,\s]+/).map(s => s.replace(/[*_.`]/g, '').toLowerCase()).filter(Boolean);
    return { mode: m[1].toLowerCase(), all: !list.length || list.includes('all'), list };
  };
  const ok = (r, name) => !r || (r.mode === 'allow' ? r.all || r.list.includes(name) : !r.all && !r.list.includes(name));
  const used = attr => [...new Set([...html.matchAll(new RegExp(`${attr}="([a-z0-9-]+)"`, 'g'))].map(m => m[1]))];
  const out = [];
  for (const [kind, attr] of [['Shapes', 'data-shape'], ['Textures', 'data-texture']]) {
    const r = rule(kind);
    for (const name of used(attr)) if (!ok(r, name)) out.push({ check: 'brand-assets', msg: `${attr}="${name}" - the brand's design-language.md rules it out (${kind}: ${r.mode} ${r.all ? 'all' : r.list.join(', ')})` });
  }
  if (register === 'explainer' && used('data-shape').length) out.push({ check: 'brand-assets', msg: `decorative shapes (${used('data-shape').join(', ')}) in an explainer video - keep each only if it carries meaning, recorded in plan.elements (video-logic.md §3a)` });
  return out;
}

// ---------- in-page helpers ----------

async function sceneInfo(page, easeNames) {
  return page.evaluate(names => {
    const s = window.__scene;
    if (!s || !s.tl || typeof s.tl.seek !== 'function') return { ok: false };
    const tl = s.tl;
    tl.pause();
    const strays = gsap.globalTimeline.getChildren(false, true, true).filter(c => c !== tl && !c.paused()).length;
    const badEases = names.filter(n => typeof gsap.parseEase(n) !== 'function');
    return { ok: true, duration: tl.duration(), labels: { ...tl.labels }, strays, badEases };
  }, easeNames);
}

// Stretches of the timeline where no tween is running (padding like .to({}, …) doesn't count as motion).
const DEAD_AIR = 0.3;
const stillSpans = page => page.evaluate(min => {
  const tl = window.__scene.tl, t0 = tl.globalTime(0), D = tl.duration();
  const control = new Set(['parent', 'duration', 'ease', 'delay', 'stagger', 'immediateRender', 'overwrite', 'onComplete', 'onStart', 'repeat', 'yoyo', 'repeatDelay', 'yoyoEase', 'paused', 'data', 'id', 'callbackScope', 'lazy', 'runBackwards', 'startAt', 'inherit', 'onCompleteParams', 'onStartParams', 'onUpdateParams', 'onReverseComplete', 'onRepeat']);
  const spans = tl.getChildren(true, true, false)
    .filter(tw => tw.duration() > 0 && Object.keys(tw.vars || {}).some(k => !control.has(k)))
    .map(tw => { const s = tw.globalTime(0) - t0; return [s, s + tw.totalDuration()]; })
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let reach = 0;
  for (const [s, e] of spans) {
    if (s - reach > min) gaps.push([reach, s]);
    reach = Math.max(reach, e);
  }
  if (D - reach > min) gaps.push([reach, D]);
  return gaps.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}, DEAD_AIR);

const seek = (page, t) => page.evaluate(time => { window.__scene.tl.seek(time, false); }, t);

const textBoxes = page => page.evaluate(() => [...document.querySelectorAll('[data-text]')].map(el => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
}));

// Visible illustrations and photos in the current frame (the brand's visual rules).
const visibleMarks = (page, W, H) => page.evaluate(([w, h]) => {
  const vis = el => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    const r = el.getBoundingClientRect();
    return o >= 0.05 && r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < w && r.top < h;
  };
  // How far each visible photo is blown up past its own pixels (object-fit: cover fills the box).
  const photos = [...document.querySelectorAll('[data-photo]')].filter(vis).map(img => {
    const r = img.getBoundingClientRect();
    const scale = img.naturalWidth ? Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) : 0;
    return { src: img.getAttribute('src'), scale: +scale.toFixed(2), natural: `${img.naturalWidth}×${img.naturalHeight}` };
  });
  return {
    illustrations: [...document.querySelectorAll('[data-illustration]')].filter(vis).length,
    photos: photos.length,
    photoList: photos,
  };
}, [W, H]);

// How much of the canvas the visible content reaches (video-logic.md → Fill the canvas). Counts text
// line boxes (read text and [data-deco] decorative type), images, SVG shapes and boxes with a fill or border; skips grounds (a plain background
// covering ≥ 90% of the canvas). Returns the empty run at each edge and the span on each axis.
const FILL_EDGE = 0.15, FILL_SPAN = 0.8;
const fillExtent = (page, W, H) => page.evaluate(([w, h]) => {
  const scene = document.querySelector('[data-scene]') || document.body;
  const opacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  // Clip to the canvas and to every ancestor that hides its overflow.
  const clip = (el, r) => {
    let [l, t, R, b] = [Math.max(0, r.left), Math.max(0, r.top), Math.min(w, r.right), Math.min(h, r.bottom)];
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).overflow === 'visible') continue;
      const p = n.getBoundingClientRect();
      [l, t, R, b] = [Math.max(l, p.left), Math.max(t, p.top), Math.min(R, p.right), Math.min(b, p.bottom)];
    }
    return R - l > 1 && b - t > 1 ? [l, t, R, b] : null;
  };
  const rects = [];
  const add = (el, r) => { const c = clip(el, r); if (c) rects.push(c); };
  const shown = el => getComputedStyle(el).visibility !== 'hidden' && opacity(el) >= 0.05;
  for (const el of scene.querySelectorAll('*')) {
    if (!shown(el) || el.closest('[data-texture]')) continue; // textures are ground, not content
    const tag = el.tagName.toLowerCase();
    if (el.closest('svg') && el.closest('svg') !== el) {
      if (/^(path|rect|circle|ellipse|line|polyline|polygon|text|image|use)$/.test(tag)) add(el, el.getBoundingClientRect());
      continue;
    }
    if (tag === 'img' || tag === 'canvas') { add(el, el.getBoundingClientRect()); continue; }
    if (el.matches('[data-text],[data-deco]')) {
      const range = document.createRange(); range.selectNodeContents(el);
      for (const r of range.getClientRects()) add(el, r);
    }
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const filled = (cs.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor)) || cs.backgroundImage !== 'none';
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    if (!filled && !bordered) continue;
    const c = clip(el, r);
    if (c && (c[2] - c[0]) * (c[3] - c[1]) < 0.9 * w * h) rects.push(c);
  }
  // Empty runs at each end of one axis, and the span between the first and last content.
  const axis = (lo, hi, len) => {
    if (!rects.length) return { start: len, end: len, span: 0 };
    const a = Math.min(...rects.map(r => r[lo])), b = Math.max(...rects.map(r => r[hi]));
    return { start: a, end: len - b, span: b - a };
  };
  const x = axis(0, 2, w), y = axis(1, 3, h);
  const f = v => +v.toFixed(3);
  // Active area: the share of a 24×24 grid of cells whose centre some content covers.
  let on = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    const cx = (i + 0.5) * w / 24, cy = (j + 0.5) * h / 24;
    if (rects.some(r => cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3])) on++;
  }
  return { active: f(on / 576), top: f(y.start / h), bottom: f(y.end / h), left: f(x.start / w), right: f(x.end / w), spanX: f(x.span / w), spanY: f(y.span / h), px: { top: Math.round(y.start), bottom: Math.round(y.end), left: Math.round(x.start), right: Math.round(x.end) } };
}, [W, H]);

// Active-area targets by register (video-logic.md §2.0): explainer 40-65%, expressive 70-100%.
const DENSITY = { explainer: 0.4, expressive: 0.7 };
function fillWarnings(fill, W, H, tag, register) {
  const out = [];
  if (DENSITY[register] && fill.active < DENSITY[register]) out.push({ check: 'fill', msg: `only ${Math.round(fill.active * 100)}% of the canvas is active${tag}; the ${register} register aims for ${Math.round(DENSITY[register] * 100)}%+ - scale the archetype up, add its layers, or let decorative type and shapes carry energy (layouts.md)` });
  const edge = (k, from, to) => {
    if (fill[k] > FILL_EDGE) out.push({ check: 'fill', msg: `nothing but ground in the ${k} ${Math.round(fill[k] * 100)}% (${from}-${to}px)${tag} - extend the hero, bleed an image or shape into it, or anchor that edge with real content (video-logic.md → Fill the canvas)` });
    return fill[k] > FILL_EDGE;
  };
  const yEdge = [edge('top', 0, fill.px.top), edge('bottom', H - fill.px.bottom, H)].some(Boolean);
  const xEdge = [edge('left', 0, fill.px.left), edge('right', W - fill.px.right, W)].some(Boolean);
  if (!yEdge && fill.spanY < FILL_SPAN) out.push({ check: 'fill', msg: `content spans only ${Math.round(fill.spanY * 100)}% of the height${tag} - plan the layout in zones for the whole canvas` });
  if (!xEdge && fill.spanX < FILL_SPAN) out.push({ check: 'fill', msg: `content spans only ${Math.round(fill.spanX * 100)}% of the width${tag} - scale the hero to the canvas` });
  return out;
}

// Read text that is blurred (its own or an ancestor's filter), or covered by a blurred layer.
const blurredText = (page, W, H) => page.evaluate(([w, h]) => {
  const blurPx = el => { const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter || ''); return m ? parseFloat(m[1]) : 0; };
  const opacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const blurred = [...document.querySelectorAll('[data-scene] *')].filter(el => blurPx(el) > 0.3 && opacity(el) >= 0.05);
  const out = [];
  for (const el of document.querySelectorAll('[data-text]')) {
    const r = el.getBoundingClientRect();
    if (opacity(el) < 0.05 || r.width < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) continue;
    const label = el.dataset.text + ' "' + el.textContent.trim().slice(0, 30) + '"';
    let own = 0;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) own = Math.max(own, blurPx(n));
    if (own > 0.3) { out.push({ el: label, why: 'text blurred ' + own + 'px' }); continue; }
    const overlaps = b => { const q = b.getBoundingClientRect(); return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; };
    if (blurred.some(b => !b.contains(el) && (el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && overlaps(b))) out.push({ el: label, why: 'text sits behind a blurred layer' });
  }
  return out;
}, [W, H]);

// Monotony (motion-craft.md → rhythm-variety): in any 3s window with 3+ tweens starting, all of them
// sharing one duration, or all travelling the same way.
const MONOTONY_WINDOW = 3;
const monotony = page => page.evaluate(win => {
  const tl = window.__scene.tl, t0 = tl.globalTime(0), D = tl.duration();
  const sign = v => (typeof v === 'number' ? Math.sign(v) : typeof v === 'string' && /^-=/.test(v) ? -1 : typeof v === 'string' && /^\+=/.test(v) ? 1 : 0);
  const tweens = tl.getChildren(true, true, false).filter(tw => tw.duration() > 0 && tw.targets && tw.targets().length).map(tw => {
    const v = tw.vars, flip = v.runBackwards ? -1 : 1;
    const dir = ('x' in v || 'y' in v) ? (sign(v.x) * flip) + ',' + (sign(v.y) * flip) : Object.keys(v).filter(k => !/^(duration|ease|stagger|delay|onUpdate|immediateRender|runBackwards|startAt)$/.test(k)).sort().join('+');
    return { s: tw.globalTime(0) - t0, d: Math.round(tw.duration() * 20) / 20, dir };
  });
  const out = [];
  for (let a = 0; a + win <= D + 0.01; a += win / 2) {
    const inWin = tweens.filter(t => t.s >= a && t.s < a + win);
    if (inWin.length < 3) continue;
    const durs = new Set(inWin.map(t => t.d)), dirs = new Set(inWin.map(t => t.dir));
    const span = a.toFixed(1) + '-' + (a + win).toFixed(1) + 's';
    if (durs.size === 1) out.push(span + ': all ' + inWin.length + ' tweens last ' + [...durs][0] + 's');
    else if (dirs.size === 1) out.push(span + ': all ' + inWin.length + ' tweens move the same way');
  }
  return out;
}, MONOTONY_WINDOW);

const SCALE_CONTRAST = 6;
// Font sizes of every visible run of read text: each [data-text] element and any descendant that holds
// text of its own (a lockup sets its words at different sizes).
const textSizes = (page, W, H) => page.evaluate(([w, h]) => {
  const out = [];
  const opacity = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  for (const root of document.querySelectorAll('[data-text]')) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (opacity(el) < 0.05 || getComputedStyle(el).visibility === 'hidden' || r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) continue;
      out.push(parseFloat(getComputedStyle(el).fontSize));
    }
  }
  return out;
}, [W, H]);

const shot = (page, W, H, file, type = 'jpeg') => page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H }, ...(type === 'jpeg' ? { type, quality: 85 } : {}) });

// ---------- encoding ----------

function ffmpeg(argv, stdin = false) {
  const proc = spawn(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-600)}`))));
  });
  return { proc, done };
}

const x264 = draft => ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', draft ? '28' : '18', '-preset', draft ? 'veryfast' : 'medium', '-movflags', '+faststart'];

// Motion blur by temporal supersampling: each output frame averages `samples` sub-frames spread over
// the shutter window (shutter 0.5 = a 180° shutter), centred on the frame's time, in linear light.
// The sub-frame order is fixed, so the output stays byte-identical. A frame whose first and last
// sub-frames match (nothing moves) is used sharp as is. In auto mode (the default for final renders),
// frames that move less than AUTO_DIFF (mean abs difference, 0-255) between those two sub-frames also
// stay sharp, so only fast moves pay for the extra samples.
const AUTO_DIFF = 0.5;
const TO_LIN = Float32Array.from({ length: 256 }, (_, c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const FROM_LIN = Uint8Array.from({ length: 65536 }, (_, i) => { const v = i / 65535; return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); });

function blurOptions(a, draft) {
  // Default: auto for final renders (8 samples where something moves fast enough to smear), off for drafts.
  const given = a.blur !== undefined && a.blur !== true;
  const auto = given ? a.blur === 'auto' : !draft;
  const samples = auto ? 8 : given ? Math.max(1, Math.round(Number(a.blur)) || 1) : 1;
  const shutter = Math.min(1, Math.max(0, a.shutter !== undefined ? Number(a.shutter) : 0.5));
  return { samples: shutter > 0 ? samples : 1, shutter, auto };
}

async function encodeScene(page, frames, fps, W, H, outMp4, draft, blur = { samples: 1 }) {
  fs.mkdirSync(path.dirname(outMp4), { recursive: true });
  const clip = { x: 0, y: 0, width: W, height: H };
  if (blur.samples <= 1) {
    const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=out_range=tv,format=yuv420p', ...x264(draft), outMp4], true);
    for (let i = 0; i < frames; i++) {
      await seek(page, i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: draft ? 80 : 95, clip });
      if (!proc.stdin.write(buf)) await new Promise(r => proc.stdin.once('drain', r));
    }
    proc.stdin.end();
    await done;
    return { blurred: 0 };
  }
  const { proc, done } = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', '-', '-vf', 'scale=out_range=tv,format=yuv420p', ...x264(draft), outMp4], true);
  const end = (frames - 1) / fps, n = blur.samples, px = W * H * 3;
  const grab = async t => { await seek(page, Math.min(end, Math.max(0, t))); return sharp(await page.screenshot({ type: 'jpeg', quality: draft ? 80 : 95, clip })).removeAlpha().raw().toBuffer(); };
  const acc = new Float32Array(px);
  let blurred = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / fps, at = k => t + ((k + 0.5) / n - 0.5) * blur.shutter / fps;
    const first = await grab(at(0)), last = await grab(at(n - 1));
    let out;
    let still = first.equals(last);
    if (!still && blur.auto) {
      let d = 0;
      for (let p = 0; p < px; p += 7) d += Math.abs(first[p] - last[p]);
      still = d / Math.ceil(px / 7) < AUTO_DIFF;
    }
    if (still) out = first.equals(last) ? first : await grab(t);
    else {
      blurred++;
      acc.fill(0);
      const add = buf => { for (let p = 0; p < px; p++) acc[p] += TO_LIN[buf[p]]; };
      add(first);
      for (let k = 1; k < n - 1; k++) add(await grab(at(k)));
      add(last);
      out = Buffer.allocUnsafe(px);
      for (let p = 0; p < px; p++) out[p] = FROM_LIN[Math.round((acc[p] / n) * 65535)];
    }
    if (!proc.stdin.write(out)) await new Promise(r => proc.stdin.once('drain', r));
  }
  proc.stdin.end();
  await done;
  return { blurred };
}

// ---------- the composition ----------

// Frames either side of every cut* label, one row per cut, to judge whether motion carries across.
async function cutSheet(rows, out) {
  if (!rows.length) return;
  const w = 180, gap = 12;
  const meta = await sharp(rows[0][0]).metadata();
  const h = Math.round(w * meta.height / meta.width);
  const tiles = [];
  for (const [r, row] of rows.entries()) {
    for (const [c, file] of row.entries()) {
      tiles.push({ input: await sharp(file).resize(w, h).toBuffer(), left: gap + c * (w + gap) + (c >= 2 ? gap * 2 : 0), top: gap + r * (h + gap) });
    }
  }
  await sharp({ create: { width: gap * 3 + 4 * (w + gap), height: gap + rows.length * (h + gap), channels: 3, background: '#111111' } })
    .composite(tiles).png().toFile(out);
}

async function renderComposition(dir, opts = {}) {
  const file = path.join(dir, 'composition.html');
  if (!fs.existsSync(file)) fail(`no composition.html in ${dir} - a video is one composition with one master timeline (references/composition.md)`, 2);
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const ratio = resolveRatio(typeof args.ratio === 'string' ? args.ratio : meta.ratio || DEFAULT_RATIO);
  const ws = resolveWorkspace(args, dir);
  const brandDir = opts.brandDir || resolveBrandDir(args, ws, dir);
  const ctx = context(brandDir, { width: ratio.width, height: ratio.height });
  ctx.motion = loadMotion(brandDir, meta.motion);
  const gsapSource = GSAP_FILES.map(f => fs.readFileSync(require.resolve('gsap/dist/' + f), 'utf8')).join('\n;\n');
  const fps = Number(args.fps) || 30;
  const W = ratio.width, H = ratio.height, draft = !!args.draft, blur = blurOptions(args, draft);
  let blurInfo = null;
  const safe = safeZone(ratio, ctx.tokens.spacing.safeArea, !args['no-platform-safe']);
  const V = ctx.motion.visual;
  const register = meta.plan?.register;

  const html = fs.readFileSync(file, 'utf8');
  const src = sourceChecks(html, ctx.tokens), mot = motionSourceChecks(html);
  const global = { slide: 'all', role: 'video', errors: [...src.errors, ...mot.errors], warnings: [...src.warnings, ...mot.warnings, ...assetChecks(html, brandDir, register)] };
  const moments = [];
  const tmp = path.join(dir, '.render-composition.html');
  fs.writeFileSync(tmp, inject(html, ctx).replace(/<style data-injected>[\s\S]*?<\/style>/, m => `${m}\n${motionHead(gsapSource, ctx.motion, html)}`));
  const { browser, page } = await openBrowser(W, H);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  let duration = 0, frames = 0, photosSeen = 0;
  const photoSrcs = new Set();
  try {
    await loadAndVerify(page, tmp, ctx.faces);
    await page.evaluate(() => (window.__fits || []).forEach(f => f())); // fitText() again, now with the brand fonts
    const literalEases = [...html.matchAll(/ease\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const info = await sceneInfo(page, [...new Set([...Object.values(ctx.motion.ease), ...curvesIn(html), ...literalEases])]);
    if (!info.ok) fail(`window.__scene.tl is missing or not a GSAP timeline - nothing to render${pageErrors.length ? ` (script error: ${pageErrors.join('; ')})` : ''}`, 2);
    duration = info.duration;
    frames = Math.round(duration * fps);
    if (info.strays) global.errors.push({ check: 'timeline', msg: `${info.strays} tween(s) outside window.__scene.tl - they will never play; add them to the master timeline` });
    for (const e of info.badEases) global.errors.push({ check: 'ease', msg: `unknown ease "${e}" - use a GSAP ease, logistic(k) or cubic-bezier(x1,y1,x2,y2), optionally with .in / .out` });
    // The whole video keeps moving: no stretch where nothing animates.
    for (const [a, b] of await stillSpans(page)) {
      global.errors.push({ check: 'motion', msg: `nothing moves from ${a}s to ${b}s - keep something animating across the whole timeline (an ambient layer, content still in motion) while text holds` });
    }
    for (const m of await monotony(page)) global.warnings.push({ check: 'monotony', msg: `${m} - mix at least 2 durations and 2 directions in every 3s (motion-craft.md → rhythm-variety)` });
    // Every sequence is built on an archetype the plan lists (layouts.md). Only for plans with a register.
    if (register) {
      const listed = new Set(meta.plan?.archetypes || []);
      for (const s of meta.plan?.sequences || []) {
        if (!s.archetype) global.errors.push({ check: 'archetype', msg: `sequence ${s.id || '?'} has no archetype - map every sequence to one of plan.archetypes (layouts.md)` });
        else if (!listed.has(s.archetype)) global.errors.push({ check: 'archetype', msg: `sequence ${s.id || '?'} uses "${s.archetype}", which isn't in plan.archetypes` });
      }
    }

    // Read moments (hold, hold2…): the text a viewer has to read, checked at rest like a carousel slide.
    const L = info.labels;
    const reads = Object.entries(L).filter(([k]) => /^hold\d*$/.test(k)).sort((a, b) => a[1] - b[1]);
    if (!reads.length) global.errors.push({ check: 'timeline', msg: 'no read moments - add tl.addLabel("hold"), "hold2"… where text is on screen and settled' });
    const cuts = Object.entries(L).filter(([k]) => /^cut\d*$/.test(k)).sort((a, b) => a[1] - b[1]);
    fs.rmSync(path.join(dir, 'png'), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'png'), { recursive: true });
    const seen = new Set();
    for (const [i, [label, t]] of reads.entries()) {
      const tag = ` (${label} @ ${t.toFixed(2)}s)`;
      const role = i === 0 ? 'hook' : i === reads.length - 1 && reads.length > 1 ? 'cta' : 'body';
      const errors = [], warnings = [];
      const png = path.join(dir, 'png', `read-${String(i + 1).padStart(2, '0')}.png`);
      await seek(page, t);
      await shot(page, W, H, png, 'png');
      const m = await page.evaluate(measureInPage, {
        W, H, safe, minFont: ctx.tokens.minFontSize, root: '[data-scene]', visibleOnly: true,
        faces: ctx.faces.map(({ family, weight, style }) => ({ family, weight, style })),
      });
      const hide = await page.addStyleTag({ content: '[data-text],[data-text] *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;text-decoration-color:transparent!important}' });
      const bgPng = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      await hide.evaluate(n => n.remove());

      for (const is of m.issues) (is.level === 'error' ? errors : warnings).push({ check: is.check, el: is.el, msg: is.msg });
      if (i === 0 && !m.hasRoot) global.errors.push({ check: 'markup', msg: 'no element with [data-scene]' });
      if (!m.items.length && V.headline !== 'optional') errors.push({ check: 'markup', msg: 'no visible [data-text] elements - tag every text element with its hierarchy level' });
      const ret = retentionChecks(m, role, ctx.tokens.retention, { swipeCue: false });
      const headlines = m.items.filter(it => it.level === 'headline').length;
      if (V.headline === 'optional' && headlines === 0) ret.errors = ret.errors.filter(e => !['headline', 'hierarchy'].includes(e.check));
      if (m.visuals <= V.maxVisuals) ret.warnings = ret.warnings.filter(w => w.check !== 'overload');
      if (ret.metrics.total > V.wordsPerBeat) errors.push({ check: 'budget', msg: `${ret.metrics.total} words on screen; the brand allows ${V.wordsPerBeat} per read moment - cut copy or give it another moment` });
      errors.push(...ret.errors, ...await contrastChecks(bgPng, m, W, H, ctx.tokens.retention.minContrast));
      warnings.push(...ret.warnings);

      // Scale contrast (type.md): largest ÷ smallest text on screen, meta rows and mixed sizes inside one
      // lockup included.
      const sizes = await textSizes(page, W, H);
      ret.metrics.scaleContrast = sizes.length > 1 ? +(Math.max(...sizes) / Math.min(...sizes)).toFixed(1) : 1;

      const fill = await fillExtent(page, W, H);
      ret.metrics.fill = fill;
      warnings.push(...fillWarnings(fill, W, H, tag, register));
      for (const b of await blurredText(page, W, H)) errors.push({ check: 'blur-on-read', el: b.el, msg: `${b.why} at a read moment - read text stays sharp; blur only far or mid planes behind it (composition.md → Depth)` });

      const marks = await visibleMarks(page, W, H);
      if (V.requires === 'illustration' && !marks.illustrations) warnings.push({ check: 'visual', msg: 'no visible [data-illustration] - the brand\'s videos show an illustration at every read moment' });
      photosSeen += marks.photos;
      for (const p of marks.photoList) {
        photoSrcs.add(p.src);
        if (p.scale > 1.5) warnings.push({ check: 'image', msg: `${p.src} is shown at ${p.scale}× its ${p.natural} pixels - it will look soft; use a larger image, show it smaller (framed), or treat it (duotone, blur, texture)` });
      }

      // Reading time for what this moment adds; it lasts until its text starts to move.
      const fresh = m.items.filter(it => it.level !== 'meta' && !seen.has(it.i));
      m.items.forEach(it => seen.add(it.i));
      const words = fresh.reduce((n, it) => n + it.words, 0);
      const end = i + 1 < reads.length ? reads[i + 1][1] : duration;
      const a = await textBoxes(page);
      const moved = c => m.items.some(it => a[it.i].some((v, k) => Math.abs(v - c[it.i][k]) > 3));
      let holdFor = end - t;
      for (let u = t + 0.1; u < end; u += 0.1) {
        await seek(page, u);
        if (moved(await textBoxes(page))) { holdFor = u - 0.1 - t; break; }
      }
      holdFor += 0.005;  // label float noise
      const need = Math.max(1, words / ctx.motion.readingSpeed);
      if (holdFor < need * 0.8) errors.push({ check: 'timing', msg: `text holds ${holdFor.toFixed(1)}s for ${words} new words - needs ≥ ${need.toFixed(1)}s at ${ctx.motion.readingSpeed} words/s` });
      else if (holdFor < need) warnings.push({ check: 'timing', msg: `text holds ${holdFor.toFixed(1)}s, a little short for ${words} words (${need.toFixed(1)}s)` });
      moments.push({ slide: label, role, png, errors, warnings, metrics: ret.metrics, t: +t.toFixed(3), holdFor: +holdFor.toFixed(2), words, readingTime: +need.toFixed(2) });
    }

    // Cut sheet: two frames before and after every cut label.
    const F = path.join(dir, 'frames');
    fs.rmSync(F, { recursive: true, force: true });
    fs.mkdirSync(F, { recursive: true });
    const rows = [];
    for (const [k, [label, t]] of cuts.entries()) {
      const row = [];
      for (const [j, dt] of [-3, -1, 0, 2].entries()) {
        const f = path.join(F, `${label}-${j}.jpg`);
        await seek(page, Math.max(0, Math.min(duration - 1 / fps, t + dt / fps)));
        await shot(page, W, H, f);
        row.push(f);
      }
      rows.push(row);
    }
    await cutSheet(rows, path.join(dir, 'cuts.png'));

    // Mid-motion sheet: 15 sharp frames from between the read moments, for the poster test in critique.
    const holds = reads.map(([, t]) => t), mids = [];
    for (let k = 0; k < 60 && mids.length < 15; k++) {
      const t = (((k * 7) % 60) + 0.5) / 60 * duration; // a fixed scatter across the timeline
      if (!holds.some(h => Math.abs(h - t) < 0.2)) mids.push(t);
    }
    mids.sort((a, b) => a - b);
    const midFiles = [];
    for (const [j, t] of mids.entries()) {
      const f = path.join(F, `motion-${String(j + 1).padStart(2, '0')}.jpg`);
      await seek(page, t);
      await shot(page, W, H, f);
      midFiles.push(f);
    }
    if (midFiles.length) await contactSheet(midFiles, path.join(dir, 'motion.png'));
    if (!rows.length) fs.rmSync(path.join(dir, 'cuts.png'), { force: true });

    const t0 = Date.now();
    blurInfo = { ...blur, ...await encodeScene(page, frames, fps, W, H, path.join(dir, 'video.mp4'), draft, blur), seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  } catch (e) {
    await browser.close();
    if (e instanceof FontError || /ffmpeg/.test(e.message)) fail(e.message, 2);
    throw e;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  await browser.close();

  // Storyboard of the read moments; poster = the first one.
  const pngs = moments.map(m => m.png).filter(p => fs.existsSync(p));
  if (pngs.length) {
    await contactSheet(pngs, path.join(dir, 'storyboard.png'));
    fs.copyFileSync(pngs[0], path.join(dir, 'poster.png'));
  }

  if (register === 'expressive' && moments.length && !moments.some(m => m.metrics.scaleContrast >= SCALE_CONTRAST)) {
    global.warnings.push({ check: 'scale-contrast', msg: `expressive video, but no read moment reaches ${SCALE_CONTRAST}× between its largest and smallest text (best ${Math.max(...moments.map(m => m.metrics.scaleContrast))}×) - set display type from the canvas against small supporting lines (type.md)` });
  }
  const target = targetDuration(args, meta);
  if (Math.abs(duration - target) > Math.max(1, target * 0.1)) global.warnings.push({ check: 'length', msg: `video is ${duration.toFixed(1)}s; target is ${target}s` });
  if ((V.requires === 'photo' || meta.useImages === true) && !photosSeen) global.warnings.push({ check: 'visual', msg: 'no visible [data-photo] at any read moment - photos were expected (brand visual rules or meta.json → useImages)' });
  const library = readJSON(path.join(dir, 'images', 'library.json'), { images: [] }).images;
  const used = new Set([...photoSrcs].map(s => path.posix.normalize(s.replace(/^\.\//, ''))));
  for (const e of library) {
    if ((used.has(e.file) || (e.cutout && used.has(e.cutout))) && e.rights !== 'own' && !e.approved) global.errors.push({ check: 'rights', msg: `${e.id} (${e.file}) is third-party (${e.source}) - get the user's yes and set "approved": true in images/library.json, or use another image` });
  }

  const reportFile = path.join(dir, 'render-report.json');
  const all = [...moments, global];
  const rel = p => path.relative(dir, p).replace(/\\/g, '/');
  writeJSON(reportFile, {
    renderedAt: new Date().toISOString(), brand: path.basename(brandDir), ratio: ratio.name,
    width: W, height: H, fps, duration: +duration.toFixed(2), target, draft, motion: ctx.motion.source, blur: blurInfo,
    summary: { errors: all.reduce((n, s) => n + s.errors.length, 0), warnings: all.reduce((n, s) => n + s.warnings.length, 0) },
    errors: global.errors, warnings: global.warnings,
    moments: moments.map(({ png, ...m }) => ({ ...m, png: rel(png) })),
  });

  console.log(`\nRendered composition at ${W}×${H}, ${fps}fps, ${duration.toFixed(1)}s${draft ? ' (draft)' : ''} (motion tokens: ${ctx.motion.source})${blurInfo?.samples > 1 ? `\nMotion blur: ${blurInfo.samples} samples${blurInfo.auto ? ' (auto)' : ''}, shutter ${blurInfo.shutter}, ${blurInfo.blurred}/${frames} frames blurred, encoded in ${blurInfo.seconds}s` : ''}\n`);
  const timing = moments.map(m => `${m.slide}@${m.t}s holds ${m.holdFor}s`).join(' · ');
  const errs = printReport(all.filter(s => s.errors.length || s.warnings.length || s !== global), `\nRead moments: ${timing || 'none'}\nTotal: ${duration.toFixed(1)}s (target ${target}s)\nVideo: ${path.join(dir, 'video.mp4')}\nStoryboard: ${path.join(dir, 'storyboard.png')}${rows_ok(dir)}\nMid-motion: ${path.join(dir, 'motion.png')}\nReport: ${reportFile}`);
  return errs;
}
const rows_ok = dir => (fs.existsSync(path.join(dir, 'cuts.png')) ? `\nCuts: ${path.join(dir, 'cuts.png')}` : '');

// ---------- archetype specimens ----------

// Each archetype template is a complete, structure-only composition. Bind its role placeholders to the
// brand's tokens, render it like a video, and (for "all") lay the posters out on one sheet.
const ARCHETYPES = path.join(SKILL_DIR, 'templates', 'archetypes');
async function renderArchetypes(which, brandDir) {
  const ids = fs.readdirSync(ARCHETYPES).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort();
  const pick = which === 'all' ? ids : [which];
  for (const id of pick) if (!ids.includes(id)) fail(`unknown archetype "${id}" - one of: ${ids.join(', ')}, or all`, 2);
  const root = path.resolve(typeof args.out === 'string' ? args.out : path.join(brandDir, 'specimens'));
  const { tokens } = context(brandDir);
  const summary = [];
  for (const id of pick) {
    const html = fs.readFileSync(path.join(ARCHETYPES, `${id}.html`), 'utf8');
    const register = /register:\s*(explainer|expressive|both)/.exec(html)?.[1] || 'both';
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'composition.html'), fillPlaceholders(html, tokens));
    writeJSON(path.join(dir, 'meta.json'), {
      brand: path.basename(brandDir), ratio: '9:16', duration: 3, specimen: id,
      plan: { register: register === 'both' ? 'explainer' : register, archetypes: [id] },
    });
    console.log(`
=== ${id} (${register}) ===`);
    summary.push({ id, errors: await renderComposition(dir, { brandDir }), poster: path.join(dir, 'poster.png') });
  }
  if (pick.length > 1) {
    const sheet = path.join(root, 'archetypes.png');
    await contactSheet(summary.map(s => s.poster).filter(p => fs.existsSync(p)), sheet);
    console.log(`
Archetypes (${pick.length}): ${summary.map(s => `${s.id}${s.errors ? ` (${s.errors} errors)` : ''}`).join(', ')}
Sheet: ${sheet}`);
  }
  return summary.reduce((n, s) => n + s.errors, 0);
}

if (args.specimen) {
  const brandDir = resolveBrandDir(args, resolveWorkspace(args));
  if (typeof args.specimen === 'string') process.exit(await renderArchetypes(args.specimen, brandDir) ? 1 : 0);
  await renderSpecimen(brandDir);
} else if (args._[0]) process.exit(await renderComposition(path.resolve(args._[0])) ? 1 : 0);
else fail('usage: render.mjs <motion-dir> [--ratio 9:16] [--duration 15] [--fps 30] [--draft] | --specimen [<archetype>|all] [--out <dir>]   (plus --brand <slug> | --brand-dir <path>)');
