#!/usr/bin/env node
// First-run setup and preflight. The workspace and brand kits are shared with Carousel Studio.
//
//   node setup.mjs            install npm deps (if needed) + Playwright Chromium
//   node setup.mjs --check    print readiness as JSON; exit 1 if not ready (no installs)
//   node setup.mjs --init --brand <slug> [--workspace <path>]
//                             create the workspace and an empty brand kit (Carousel Studio format + motion.json)
//   node setup.mjs --motion --brand <slug>
//                             add an empty motion.json to an existing brand, to fill in with the user
//                             (the skill ships no style: how a brand moves is defined at setup)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { SKILL_DIR, parseArgs, readJSON, writeJSON, resolveWorkspace, fail } from './lib/workspace.mjs';
import { loadMotion } from './lib/motion.mjs';

const args = parseArgs();
const require = createRequire(path.join(SKILL_DIR, 'package.json'));
const DEPS = ['playwright', 'sharp', 'dotenv', 'gsap', 'ffmpeg-static'];

function status() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const deps = DEPS.every(d => { try { require.resolve(d); return true; } catch { return false; } });
  let chromium = false, ffmpeg = false;
  if (deps) {
    try { chromium = fs.existsSync(require('playwright').chromium.executablePath()); } catch { /* not installed */ }
    try { ffmpeg = fs.existsSync(require('ffmpeg-static')); } catch { /* not installed */ }
  }
  const ws = resolveWorkspace(args);
  const config = readJSON(path.join(ws, 'config.json'), null);
  const brandsDir = path.join(ws, 'brands');
  const brands = config && fs.existsSync(brandsDir)
    ? fs.readdirSync(brandsDir).filter(b => fs.existsSync(path.join(brandsDir, b, 'tokens.json')))
      .map(slug => {
        const file = path.join(brandsDir, slug, 'motion.json');
        if (!fs.existsSync(file)) return { slug, motion: 'missing' };
        return { slug, motion: loadMotion(path.join(brandsDir, slug), null, { strict: false }) ? 'ready' : 'incomplete' };
      })
    : [];
  return {
    node: process.versions.node, nodeOk: nodeMajor >= 18, deps, chromium, ffmpeg,
    workspace: ws, workspaceExists: !!config,
    activeBrand: config?.activeBrand ?? null,
    brands,
  };
}

const run = cmd => execSync(cmd, { cwd: SKILL_DIR, stdio: 'inherit' });

function copyDir(src, dst, skip = []) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true }).filter(e => !skip.includes(e.name))) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

// Same layout Carousel Studio creates, so either skill can open the workspace first.
function ensureWorkspace(ws, activeBrand) {
  for (const d of ['brands', 'output', 'motion']) fs.mkdirSync(path.join(ws, d), { recursive: true });
  const cfgFile = path.join(ws, 'config.json');
  const cfg = readJSON(cfgFile, {});
  if (activeBrand && !cfg.activeBrand) cfg.activeBrand = activeBrand;
  writeJSON(cfgFile, cfg);
  const gi = path.join(ws, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.env\n');
  const env = path.join(ws, '.env.example');
  if (!fs.existsSync(env)) fs.writeFileSync(env, '# Optional image providers (not used until images are enabled in images.json)\nFAL_KEY=\nATLAS_CLOUD_API_KEY=\nOPENAI_API_KEY=\n');
  return cfg;
}

const brandSlug = () => {
  const slug = typeof args.brand === 'string' ? args.brand : fail('needs --brand <slug>');
  if (!/^[a-z0-9-]+$/.test(slug)) fail('brand slug must be lowercase letters, digits and dashes');
  return slug;
};

if (args.check) {
  const s = status();
  console.log(JSON.stringify(s, null, 2));
  process.exit(s.nodeOk && s.deps && s.chromium && s.ffmpeg ? 0 : 1);
}

if (args.motion) {
  const ws = resolveWorkspace(args);
  const dst = path.join(ws, 'brands', brandSlug());
  if (!fs.existsSync(path.join(dst, 'tokens.json'))) fail(`brand not found: ${dst}`);
  const file = path.join(dst, 'motion.json');
  if (fs.existsSync(file)) fail(`motion.json already exists: ${file}`);
  fs.copyFileSync(path.join(SKILL_DIR, 'templates', 'brand', 'motion.json'), file);
  console.log(`Empty motion.json added - fill it in with the user (references/brand-setup.md → Motion setup): ${file}`);
  process.exit(0);
}

if (args.init) {
  const ws = resolveWorkspace(args);
  const slug = brandSlug();
  const dst = path.join(ws, 'brands', slug);
  if (fs.existsSync(path.join(dst, 'tokens.json'))) fail(`brand already exists: ${dst} - use --motion to add motion tokens to it`);
  ensureWorkspace(ws, slug);
  copyDir(path.join(SKILL_DIR, 'templates', 'brand'), dst);
  for (const d of ['fonts', 'logo', 'layouts', 'style-refs']) fs.mkdirSync(path.join(dst, d), { recursive: true });
  console.log(`Brand kit created at ${dst}`);
  console.log(`Workspace: ${ws}`);
  process.exit(0);
}

const s = status();
if (!s.nodeOk) fail(`Node ${s.node} is too old; install Node 18 or newer.`);
if (!s.deps) { console.log('Installing npm dependencies…'); run('npm install --no-audit --no-fund'); }
if (!status().chromium) { console.log('Installing Playwright Chromium…'); run('npx playwright install chromium'); }
const final = status();
const ready = final.deps && final.chromium && final.ffmpeg;
console.log(ready ? 'Render dependencies ready.' : 'Setup incomplete - see errors above.');
process.exit(ready ? 0 : 1);
