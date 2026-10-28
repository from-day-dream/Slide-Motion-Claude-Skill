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
//                   [--brand <slug> | --brand-dir <path>] [--workspace <path>]
//   node render.mjs --specimen [--brand <slug> | --brand-dir <path>]
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
  resolveRatio, safeZone, loadMotion, motionHead, curvesIn, GSAP_FILES, targetDuration, DEFAULT_RATIO,
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
  if (/Math\.random/.test(html)) warnings.push({ check: 'determinism', msg: 'Math.random makes every render different - use fixed values' });
  if (!/window\.__scene\s*=/.test(html)) errors.push({ check: 'timeline', msg: 'scene never sets window.__scene = { tl }' });
  return { errors, warnings };
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

async function encodeScene(page, frames, fps, W, H, outMp4, draft) {
  fs.mkdirSync(path.dirname(outMp4), { recursive: true });
  const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=out_range=tv,format=yuv420p', ...x264(draft), outMp4], true);
  for (let i = 0; i < frames; i++) {
    await seek(page, i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: draft ? 80 : 95, clip: { x: 0, y: 0, width: W, height: H } });
    if (!proc.stdin.write(buf)) await new Promise(r => proc.stdin.once('drain', r));
  }
  proc.stdin.end();
  await done;
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

async function renderComposition(dir) {
  const file = path.join(dir, 'composition.html');
  if (!fs.existsSync(file)) fail(`no composition.html in ${dir} - a video is one composition with one master timeline (references/composition.md)`, 2);
  const meta = readJSON(path.join(dir, 'meta.json'), {});
  const ratio = resolveRatio(typeof args.ratio === 'string' ? args.ratio : meta.ratio || DEFAULT_RATIO);
  const ws = resolveWorkspace(args, dir);
  const brandDir = resolveBrandDir(args, ws, dir);
  const ctx = context(brandDir, { width: ratio.width, height: ratio.height });
  ctx.motion = loadMotion(brandDir, meta.motion);
  const gsapSource = GSAP_FILES.map(f => fs.readFileSync(require.resolve('gsap/dist/' + f), 'utf8')).join('\n;\n');
  const fps = Number(args.fps) || 30;
  const W = ratio.width, H = ratio.height, draft = !!args.draft;
  const safe = safeZone(ratio, ctx.tokens.spacing.safeArea, !args['no-platform-safe']);
  const V = ctx.motion.visual;

  const html = fs.readFileSync(file, 'utf8');
  const src = sourceChecks(html, ctx.tokens), mot = motionSourceChecks(html);
  const global = { slide: 'all', role: 'video', errors: [...src.errors, ...mot.errors], warnings: [...src.warnings, ...mot.warnings] };
  const moments = [];
  const tmp = path.join(dir, '.render-composition.html');
  fs.writeFileSync(tmp, inject(html, ctx).replace(/<style data-injected>[\s\S]*?<\/style>/, m => `${m}\n${motionHead(gsapSource, ctx.motion, html)}`));
  const { browser, page } = await openBrowser(W, H);
  let duration = 0, frames = 0, photosSeen = 0;
  const photoSrcs = new Set();
  try {
    await loadAndVerify(page, tmp, ctx.faces);
    const literalEases = [...html.matchAll(/ease\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const info = await sceneInfo(page, [...new Set([...Object.values(ctx.motion.ease), ...curvesIn(html), ...literalEases])]);
    if (!info.ok) fail('window.__scene.tl is missing or not a GSAP timeline - nothing to render', 2);
    duration = info.duration;
    frames = Math.round(duration * fps);
    if (info.strays) global.errors.push({ check: 'timeline', msg: `${info.strays} tween(s) outside window.__scene.tl - they will never play; add them to the master timeline` });
    for (const e of info.badEases) global.errors.push({ check: 'ease', msg: `unknown ease "${e}" - use a GSAP ease, logistic(k) or cubic-bezier(x1,y1,x2,y2), optionally with .in / .out` });
    // The whole video keeps moving: no stretch where nothing animates.
    for (const [a, b] of await stillSpans(page)) {
      global.errors.push({ check: 'motion', msg: `nothing moves from ${a}s to ${b}s - keep something animating across the whole timeline (an ambient layer, content still in motion) while text holds` });
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
    if (!rows.length) fs.rmSync(path.join(dir, 'cuts.png'), { force: true });

    await encodeScene(page, frames, fps, W, H, path.join(dir, 'video.mp4'), draft);
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

  const target = targetDuration(args, meta);
  if (Math.abs(duration - target) > Math.max(1, target * 0.1)) global.warnings.push({ check: 'length', msg: `video is ${duration.toFixed(1)}s; target is ${target}s` });
  if ((V.requires === 'photo' || meta.useImages === true) && !photosSeen) global.warnings.push({ check: 'visual', msg: 'no visible [data-photo] at any read moment - photos were expected (brand visual rules or meta.json → useImages)' });
  const library = readJSON(path.join(dir, 'images', 'library.json'), { images: [] }).images;
  const used = new Set([...photoSrcs].map(s => path.posix.normalize(s.replace(/^\.\//, ''))));
  for (const e of library) {
    if (used.has(e.file) && e.rights !== 'own' && !e.approved) global.errors.push({ check: 'rights', msg: `${e.id} (${e.file}) is third-party (${e.source}) - get the user's yes and set "approved": true in images/library.json, or use another image` });
  }

  const reportFile = path.join(dir, 'render-report.json');
  const all = [...moments, global];
  const rel = p => path.relative(dir, p).replace(/\\/g, '/');
  writeJSON(reportFile, {
    renderedAt: new Date().toISOString(), brand: path.basename(brandDir), ratio: ratio.name,
    width: W, height: H, fps, duration: +duration.toFixed(2), target, draft, motion: ctx.motion.source,
    summary: { errors: all.reduce((n, s) => n + s.errors.length, 0), warnings: all.reduce((n, s) => n + s.warnings.length, 0) },
    errors: global.errors, warnings: global.warnings,
    moments: moments.map(({ png, ...m }) => ({ ...m, png: rel(png) })),
  });

  console.log(`\nRendered composition at ${W}×${H}, ${fps}fps, ${duration.toFixed(1)}s${draft ? ' (draft)' : ''} (motion tokens: ${ctx.motion.source})\n`);
  const timing = moments.map(m => `${m.slide}@${m.t}s holds ${m.holdFor}s`).join(' · ');
  const errs = printReport(all.filter(s => s.errors.length || s.warnings.length || s !== global), `\nRead moments: ${timing || 'none'}\nTotal: ${duration.toFixed(1)}s (target ${target}s)\nVideo: ${path.join(dir, 'video.mp4')}\nStoryboard: ${path.join(dir, 'storyboard.png')}${rows_ok(dir)}\nReport: ${reportFile}`);
  process.exit(errs ? 1 : 0);
}
const rows_ok = dir => (fs.existsSync(path.join(dir, 'cuts.png')) ? `\nCuts: ${path.join(dir, 'cuts.png')}` : '');

if (args.specimen) await renderSpecimen(resolveBrandDir(args, resolveWorkspace(args)));
else if (args._[0]) await renderComposition(path.resolve(args._[0]));
else fail('usage: render.mjs <motion-dir> [--ratio 9:16] [--duration 15] [--fps 30] [--draft] | --specimen   (plus --brand <slug> | --brand-dir <path>)');
