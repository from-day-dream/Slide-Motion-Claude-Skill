#!/usr/bin/env node
// Provider-agnostic image generation: fal, Atlas Cloud or the OpenAI API -> local 1080×1350 PNG + sidecar JSON
// (another canvas with --size WxH, e.g. 1080x1920 for slide-motion).
// Copied verbatim between carousel-studio and slide-motion - keep the two copies identical.
// Models live in config/providers.json (deep-merged with <workspace>/providers.json).
//
// Usage:
//   node image.mjs --check [--want on|off] [--provider fal|atlas|openai] [--model <key>] [--brand <slug>]
//       Resolve whether images are on for this run (brand default, request, key). Prints JSON. No API calls.
//   node image.mjs --prompt "<text>" --out <carousel>/images/02.png [--refs a.png,b.png] [--seed 7]
//       [--provider fal|atlas|openai] [--model <key>] [--lora <url> --lora-scale 0.8] [--no-anchor] [--brand <slug>] [--size WxH]
//   node image.mjs --pass1 "<base>" [--pass2 "<edit>"] [--pass3 "<edit>"] --out <png> [--from-pass N] [--refs …]
//       Layered image (max 3 passes): base, then edits of the previous pass. See references/layered-images.md.
//   node image.mjs --batch jobs.json [--provider …] [--model …] [--brand <slug>]
//       jobs.json = [{ "prompt": "...", "out": ".../images/02.png", "refs": ["..."], "seed": 1 }, …], run in parallel.
//       Layered job: { "out": "...", "passes": [{ "prompt": "..." }, { "prompt": "...", "refs": [] }], "fromPass": 2 }
//
// Exit codes: 0 ok; 1 generation failed (after one retry) - redesign that slide type-led;
//             2 usage/config error; 3 fatal provider error (bad key, quota, 4xx config) - stop calling the provider this run;
//             4 layered image partial - PNG built from the last good pass; rebuild missing elements in HTML or retry.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import {
  SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace, resolveBrandDir, stripComments,
} from './lib/workspace.mjs';

const args = parseArgs();
const ws = resolveWorkspace(args);
dotenv.config({ path: path.join(ws, '.env'), quiet: true });
// Output canvas: 1080×1350 slides by default; --size WxH for other canvases (slide-motion video frames).
const [W, H] = typeof args.size === 'string' ? args.size.split('x').map(Number) : [1080, 1350];
if (!(W > 0 && H > 0)) fail('--size must look like 1080x1920', 2);
const NO_TEXT = 'No text, no letters, no words, no numbers, no logos, no watermark, no signage.';

// ---------- config ----------

function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a?.[k], v);
  return out;
}

const providers = stripComments(deepMerge(
  readJSON(path.join(SKILL_DIR, 'config', 'providers.json')),
  readJSON(path.join(ws, 'providers.json'), {}),
));

function brandImages() {
  try {
    const dir = resolveBrandDir(args, ws);
    return { dir, cfg: stripComments(readJSON(path.join(dir, 'images.json'), {})) };
  } catch { return { dir: null, cfg: {} }; }
}

function resolveModel(cfg) {
  const provider = typeof args.provider === 'string' ? args.provider : cfg.provider && cfg.provider !== 'none' ? cfg.provider : null;
  if (!provider) return { provider: null };
  const p = providers[provider];
  if (!p) return { provider, error: `provider "${provider}" is not configured (known: ${Object.keys(providers).join(', ')})` };
  const name = typeof args.model === 'string' ? args.model : (provider === cfg.provider && cfg.model) || p.defaultModel;
  const model = p.models?.[name];
  if (!model) return { provider, modelName: name, error: `model "${name}" is not configured for ${provider} (known: ${Object.keys(p.models || {}).join(', ')})` };
  // Landscape canvases ask the model for a landscape image (its configured size, turned).
  const [mw, mh] = sizeWH(model.size);
  const sized = W > H && mh > mw ? { ...model, size: `${mh}x${mw}` } : model;
  return { provider, p, modelName: name, model: sized, keyEnv: p.keyEnv, key: process.env[p.keyEnv] };
}

// ---------- check mode (§9.1 decision A) ----------

function check() {
  const { cfg } = brandImages();
  const want = args.want === 'on' ? true : args.want === 'off' ? false : null;
  const requested = want !== null || typeof args.provider === 'string' || typeof args.model === 'string';
  const enabled = want === false ? false : requested ? true : !!cfg.enabled;
  const r = resolveModel(want && !args.provider && (!cfg.provider || cfg.provider === 'none') ? { ...cfg, provider: Object.keys(providers)[0] } : cfg);
  const out = { enabled, requested, provider: r.provider || null, model: r.modelName || null, keyEnv: r.keyEnv || null, keyPresent: !!r.key, decision: '', message: '' };
  if (!enabled) { out.decision = 'type-led'; out.message = 'Images are off for this carousel.'; }
  else if (r.error) { out.decision = 'ask'; out.message = `${r.error}. Ask which configured provider/model to use; if none has a key, treat as key missing.`; }
  else if (!r.key && requested) { out.decision = 'ask'; out.message = `Images were requested but ${r.keyEnv} is not set in ${path.join(ws, '.env')}. Ask: continue type-led, or add the key and resume. If no reply is possible, continue type-led and say so.`; }
  else if (!r.key) { out.decision = 'type-led'; out.message = `No ${r.provider} key found (${r.keyEnv}), so this carousel is type-led.`; }
  else { out.decision = 'images'; out.message = `Generating images with ${r.provider} / ${r.modelName}.`; }
  console.log(JSON.stringify(out, null, 2));
}

// ---------- HTTP helpers ----------

class ProviderError extends Error {
  constructor(msg, { fatal = false, status } = {}) { super(msg); this.fatal = fatal; this.status = status; }
}

async function http(url, opts = {}, timeoutMs = 120000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) {
      const detail = typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
      // 401/403/402/404/422: key, quota or config problems - retrying won't help.
      throw new ProviderError(`${res.status} from ${new URL(url).host}: ${detail}`, { fatal: [401, 402, 403, 404, 422].includes(res.status), status: res.status });
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') throw new ProviderError(`timed out after ${timeoutMs / 1000}s: ${url}`);
    throw e;
  } finally { clearTimeout(t); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const POLL_LIMIT_MS = 6 * 60 * 1000;

function dataURI(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

const sizeWH = s => (Array.isArray(s) ? s : String(s || '1088x1360').split('x').map(Number));

// ---------- providers ----------

async function runFal(p, key, model, job) {
  const endpoint = job.refs.length && model.edit ? model.edit : model.text;
  const [w, h] = sizeWH(model.size);
  const input = { prompt: job.prompt, num_images: 1, ...(model.extra || {}) };
  if (model.kind === 'gpt-image') {
    input.image_size = { width: w, height: h };
    input.quality = model.quality || 'high';
    input.output_format = 'png';
    if (job.refs.length && model.edit) input.image_urls = job.refs.map(dataURI);
  } else {
    input.image_size = { width: w, height: h };
    input.output_format = 'png';
    if (job.seed !== undefined) input.seed = Number(job.seed);
    if (model.kind === 'flux-lora' && job.lora?.url) input.loras = [{ path: job.lora.url, scale: Number(job.lora.scale ?? 1) }];
  }
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const sub = await http(`${p.queueUrl}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(input) });
  if (!sub.request_id) throw new ProviderError(`unexpected fal submit response: ${JSON.stringify(sub).slice(0, 200)}`);
  const statusUrl = sub.status_url || `${p.queueUrl}/${endpoint}/requests/${sub.request_id}/status`;
  const responseUrl = sub.response_url || `${p.queueUrl}/${endpoint}/requests/${sub.request_id}`;
  const start = Date.now();
  for (;;) {
    const st = await http(statusUrl, { headers });
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.error) throw new ProviderError(`fal job failed: ${JSON.stringify(st.error || st).slice(0, 300)}`);
    if (Date.now() - start > POLL_LIMIT_MS) throw new ProviderError('fal job did not finish within 6 minutes');
    await sleep(2000);
  }
  const out = await http(responseUrl, { headers });
  const url = out.images?.[0]?.url;
  if (!url) throw new ProviderError(`fal returned no image: ${JSON.stringify(out).slice(0, 300)}`);
  return { url, seed: out.seed ?? job.seed ?? null, endpoint, requestId: sub.request_id };
}

async function runAtlas(p, key, model, job) {
  const endpoint = job.refs.length && model.edit ? model.edit : model.text;
  const [w, h] = sizeWH(model.size);
  const body = {
    model: endpoint, prompt: job.prompt, size: `${w}x${h}`,
    quality: model.quality || 'high', output_format: 'png', ...(model.extra || {}),
  };
  if (job.refs.length && model.edit) body.images = job.refs.map(dataURI);
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const sub = await http(`${p.baseUrl}/generateImage`, { method: 'POST', headers, body: JSON.stringify(body) });
  // Atlas docs show both {data:{id}} and {id}; accept either.
  const d0 = sub.data || sub;
  const id = d0.id;
  if (!id) throw new ProviderError(`unexpected Atlas submit response: ${JSON.stringify(sub).slice(0, 200)}`);
  const start = Date.now();
  let outputs = d0.outputs;
  let status = d0.status;
  while (!['completed', 'succeeded'].includes(status) || !outputs?.length) {
    if (status === 'failed') break;
    if (Date.now() - start > POLL_LIMIT_MS) throw new ProviderError('Atlas job did not finish within 6 minutes');
    await sleep(2500);
    const r = await http(`${p.baseUrl}/prediction/${id}`, { headers });
    const d = r.data || r;
    status = d.status; outputs = d.outputs;
    if (status === 'failed') throw new ProviderError(`Atlas job failed: ${d.error || JSON.stringify(d).slice(0, 300)}`);
  }
  if (status === 'failed') throw new ProviderError(`Atlas job failed: ${d0.error || ''}`);
  return { url: outputs[0], seed: null, endpoint, requestId: id };
}

// OpenAI Images API: synchronous, base64 output. Edits are multipart with repeated image[] parts.
async function runOpenAI(p, key, model, job) {
  const edit = job.refs.length && model.edit;
  const name = edit ? model.edit : model.text;
  const [w, h] = sizeWH(model.size);
  const fields = { model: name, prompt: job.prompt, size: `${w}x${h}`, quality: model.quality || 'high', output_format: 'png', n: 1, ...(model.extra || {}) };
  const auth = { Authorization: `Bearer ${key}` };
  let opts;
  if (edit) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    for (const f of job.refs) {
      const uri = dataURI(f);
      form.append('image[]', new Blob([fs.readFileSync(f)], { type: uri.slice(5, uri.indexOf(';')) }), path.basename(f));
    }
    opts = { method: 'POST', headers: auth, body: form };
  } else {
    opts = { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
  }
  let out;
  try { out = await http(`${p.baseUrl}/images/${edit ? 'edits' : 'generations'}`, opts, 300000); }
  catch (e) {
    if (e.status === 403) e.message += ' (your OpenAI organization may need verification to use GPT Image models)';
    throw e;
  }
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError(`OpenAI returned no image: ${JSON.stringify(out).slice(0, 300)}`);
  return { url: `data:image/png;base64,${b64}`, seed: null, endpoint: `${name} (${edit ? 'edits' : 'generations'})`, requestId: null };
}

const RUNNERS = { fal: runFal, atlas: runAtlas, openai: runOpenAI };

// ---------- one job: generate, retry once, crop, sidecar ----------

async function fetchImage(url) {
  if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
  const res = await fetch(url);
  if (!res.ok) throw new ProviderError(`download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const MAX_PASSES = 3;
const PRESERVE = 'Edit the first image. Keep everything already in it unchanged: subject, face, pose, clothing, lighting, background, framing and colours. Only make the change described';
const sentence = s => s.trim().replace(/[\s.,;:]*$/, '.');
const sidecarFile = out => out.replace(/\.(png|jpe?g|webp)$/i, '.json');
const passFile = (out, n) => out.replace(/\.(png|jpe?g|webp)$/i, `.pass${n}.png`);
const relTo = (out, f) => path.relative(path.dirname(out), f).replace(/\\/g, '/');

// Base passes get the brand style anchor; edit passes get the preservation sentence instead,
// so they don't restyle what's already there. Every prompt ends with the no-text sentence.
function buildPrompt(text, brand, { edit = false } = {}) {
  const anchor = !edit && !args['no-anchor'] && brand.cfg.styleAnchor;
  return [edit && PRESERVE, text, anchor, NO_TEXT].filter(Boolean).map(sentence).join(' ').replace(/\s+/g, ' ');
}

async function callWithRetry(r, job) {
  const runner = RUNNERS[r.provider];
  if (!runner) throw new ProviderError(`no runner for provider "${r.provider}"`, { fatal: true });
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await runner(r.p, r.key, r.model, job); }
    catch (e) { lastErr = e; if (e.fatal) break; }
  }
  throw lastErr;
}

// Centre-crop and resize to the canvas (4:5 slide unless --size says otherwise).
async function cropToSlide(input, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(input).resize(W, H, { fit: 'cover', position: 'centre' }).png().toFile(out);
}

async function runJob(r, job, brand) {
  if (job.passes) return runLayered(r, job, brand);
  const prompt = buildPrompt(job.prompt, brand);
  const result = await callWithRetry(r, { ...job, prompt });
  await cropToSlide(await fetchImage(result.url), job.out);
  const sidecar = {
    provider: r.provider, model: r.modelName, endpoint: result.endpoint, prompt,
    references: job.refs.map(f => relTo(job.out, f)),
    lora: r.model.kind === 'flux-lora' ? job.lora || null : null,
    seed: result.seed, requestId: result.requestId, size: `${W}x${H}`, createdAt: new Date().toISOString(),
  };
  writeJSON(sidecarFile(job.out), sidecar);
  return sidecar;
}

// Layered image: pass 1 is the base, passes 2..3 edit the previous pass's output.
// Each pass is saved uncropped as <name>.passN.png; only the last good pass is cropped to <name>.png.
// A failed edit pass leaves a partial result built from the last good pass.
async function runLayered(r, job, brand) {
  const start = job.fromPass || 1;
  const kept = start > 1 ? (readJSON(sidecarFile(job.out), {}).passes || []).filter(p => p.n < start) : [];
  const done = [];
  let last = start > 1 ? passFile(job.out, start - 1) : null;
  let error = null;
  for (let n = start; n <= job.passes.length; n++) {
    const pass = job.passes[n - 1];
    const edit = n > 1;
    const refs = edit ? [last, ...pass.refs] : [...job.refs, ...pass.refs];
    const prompt = buildPrompt(pass.prompt, brand, { edit });
    let result;
    try { result = await callWithRetry(r, { ...job, prompt, refs, seed: edit ? undefined : job.seed }); }
    catch (e) { if (!edit) throw e; error = e; break; }
    const file = passFile(job.out, n);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp(await fetchImage(result.url)).png().toFile(file);
    done.push({ n, prompt, endpoint: result.endpoint, file: relTo(job.out, file), refs: refs.map(f => relTo(job.out, f)), seed: result.seed, requestId: result.requestId });
    last = file;
  }
  await cropToSlide(last, job.out);
  const passes = [...kept, ...done];
  const sidecar = {
    provider: r.provider, model: r.modelName, endpoint: passes.at(-1)?.endpoint, prompt: passes[0]?.prompt,
    references: job.refs.map(f => relTo(job.out, f)), lora: null,
    seed: passes[0]?.seed ?? null, size: `${W}x${H}`, createdAt: new Date().toISOString(),
    passes, plannedPasses: job.passes.length, completedPasses: passes.length,
    partial: !!error, ...(error ? { error: error.message } : {}),
  };
  writeJSON(sidecarFile(job.out), sidecar);
  if (error) sidecar.fatalError = !!error.fatal;
  return sidecar;
}

function toRefs(v) {
  const refs = (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean).map(f => path.resolve(f));
  for (const f of refs) if (!fs.existsSync(f)) fail(`reference image not found: ${f}`, 2);
  return refs;
}

function jobFrom(o, brand) {
  const refs = toRefs(o.refs);
  const out = o.out && path.resolve(o.out);
  let passes = null;
  if (o.passes) {
    if (!Array.isArray(o.passes) || !o.passes.length) fail(`"passes" must be a non-empty array (${o.out})`, 2);
    if (o.passes.length > MAX_PASSES) fail(`${o.passes.length} passes requested for ${o.out}; the maximum is ${MAX_PASSES} (a base plus two edits). Fold groups together or move elements to HTML.`, 2);
    passes = o.passes.map((p, i) => {
      const prompt = typeof p === 'string' ? p : p.prompt;
      if (!prompt) fail(`pass ${i + 1} of ${o.out} has no prompt`, 2);
      return { prompt: String(prompt), refs: toRefs(p.refs) };
    });
  }
  if ((!o.prompt && !passes) || !out) fail('each job needs "out" and either "prompt" or "passes"', 2);
  const fromPass = o.fromPass ? Number(o.fromPass) : null;
  if (fromPass) {
    if (!passes || fromPass < 1 || fromPass > passes.length) fail(`fromPass ${fromPass} is out of range for ${o.out}`, 2);
    if (fromPass > 1 && !fs.existsSync(passFile(out, fromPass - 1))) fail(`cannot resume ${o.out} from pass ${fromPass}: ${passFile(out, fromPass - 1)} not found`, 2);
  }
  const lora = o.lora || (args.lora ? { url: args.lora, scale: args['lora-scale'] ?? 1 } : brand.cfg.lora?.url ? brand.cfg.lora : null);
  return { prompt: o.prompt ? String(o.prompt) : null, passes, fromPass, out, refs, seed: o.seed, lora };
}

async function generate() {
  const brand = brandImages();
  const r = resolveModel(brand.cfg.provider && brand.cfg.provider !== 'none' ? brand.cfg : { ...brand.cfg, provider: args.provider || Object.keys(providers)[0] });
  if (r.error) fail(r.error, 2);
  if (!r.key) fail(`${r.keyEnv} is not set. Add it to ${path.join(ws, '.env')}.`, 3);
  if (r.model.kind === 'gpt-image' && !r.model.edit && args.refs) console.warn('warn: this model has no edit endpoint; references ignored');

  const cliPasses = [args.pass1, args.pass2, args.pass3].filter(p => typeof p === 'string');
  const jobs = args.batch
    ? readJSON(path.resolve(args.batch)).map(o => jobFrom(o, brand))
    : [jobFrom({
      prompt: args['prompt-file'] ? fs.readFileSync(args['prompt-file'], 'utf8') : args.prompt,
      passes: cliPasses.length ? cliPasses : undefined, fromPass: args['from-pass'],
      out: args.out, refs: args.refs, seed: args.seed,
    }, brand)];
  if (jobs.some(j => j.passes?.length > 1) && !r.model.edit) {
    fail(`layered images need a model with an edit endpoint (e.g. gpt-image-2.5); "${r.modelName}" on ${r.provider} has none`, 2);
  }

  const results = await Promise.allSettled(jobs.map(j => runJob(r, j, brand)));
  let fatal = false, failed = 0, partial = 0;
  results.forEach((res, i) => {
    const out = path.relative(process.cwd(), jobs[i].out);
    const v = res.value;
    if (res.status === 'rejected') { failed++; fatal ||= !!res.reason.fatal; console.log(`FAIL  ${out}  ${res.reason.fatal ? '[fatal] ' : ''}${res.reason.message}`); }
    else if (v.partial) { partial++; fatal ||= v.fatalError; console.log(`PART  ${out}  (${v.completedPasses}/${v.plannedPasses} passes; pass ${v.completedPasses + 1} failed: ${v.error})`); }
    else console.log(`ok    ${out}  (${v.provider}/${v.model}${v.passes ? `, ${v.passes.length} passes` : ''}${v.seed != null ? `, seed ${v.seed}` : ''})`);
  });
  if (fatal) console.log('\nProvider error that retrying will not fix (key, quota or model config). Stop calling the provider for this run; finish type-led.');
  else if (failed) console.log('\nRedesign the failed slide(s) type-led and record the fallback in meta.json.');
  if (partial) console.log('Partial layered image(s): the PNG is built from the last good pass. Rebuild the missing elements in HTML/SVG or drop them, or retry with --from-pass.');
  process.exit(fatal ? 3 : failed ? 1 : partial ? 4 : 0);
}

if (args.check) check();
else if (args.prompt || args['prompt-file'] || args.batch || args.pass1) await generate();
else fail('usage: image.mjs --check | --prompt "<text>" --out <png> [--refs a,b] | --batch jobs.json   (see header)', 2);
