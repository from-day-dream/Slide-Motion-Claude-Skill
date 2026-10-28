// Shared helpers: argument parsing, workspace/brand resolution, token loading.
// Copied verbatim between carousel-studio and slide-motion (scripts/lib/) - keep the two copies identical.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Minimal --flag value / --flag parser. Positional args land in `_`.
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

export function fail(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

export function readJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    fail(`missing file: ${file}`);
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail(`invalid JSON in ${file}: ${e.message}`); }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Workspace: --workspace, then CAROUSEL_STUDIO_HOME, then a workspace inferred from a
// carousel dir (<ws>/output/<name>), then ./carousel-studio.
export function resolveWorkspace(args = {}, carouselDir) {
  if (args.workspace) return path.resolve(args.workspace);
  if (process.env.CAROUSEL_STUDIO_HOME) return path.resolve(process.env.CAROUSEL_STUDIO_HOME);
  if (carouselDir) {
    const guess = path.resolve(carouselDir, '..', '..');
    if (fs.existsSync(path.join(guess, 'config.json'))) return guess;
  }
  return path.resolve('carousel-studio');
}

// Brand dir: --brand-dir, then --brand slug, then meta.json brand, then config.json activeBrand.
export function resolveBrandDir(args = {}, workspace, carouselDir) {
  if (args['brand-dir']) return path.resolve(args['brand-dir']);
  let slug = typeof args.brand === 'string' ? args.brand : undefined;
  if (!slug && carouselDir) slug = readJSON(path.join(carouselDir, 'meta.json'), {}).brand;
  if (!slug) slug = readJSON(path.join(workspace, 'config.json'), {}).activeBrand;
  if (!slug) fail(`no brand given and no activeBrand in ${path.join(workspace, 'config.json')}`);
  const dir = path.join(workspace, 'brands', slug);
  if (!fs.existsSync(dir)) fail(`brand folder not found: ${dir}`);
  return dir;
}

export function loadTokens(brandDir) {
  const tokens = stripComments(readJSON(path.join(brandDir, 'tokens.json')));
  tokens.canvas ??= { width: 1080, height: 1350 };
  tokens.spacing ??= {};
  tokens.spacing.safeArea ??= 72;
  tokens.minFontSize ??= { default: 28, meta: 20 };
  tokens.retention = { ...DEFAULT_RETENTION, ...(tokens.retention || {}) };
  return tokens;
}

export const DEFAULT_RETENTION = {
  headlineWords: { hook: 8, other: 10 },
  keyWords: 15,
  supportWords: 25,
  supportMaxLines: 2,
  maxItems: 4,
  itemWords: 5,
  clarifierWords: 5,
  slideWords: { hook: 35, other: 50 },
  maxEmphasisPerElement: 1,
  minContrast: 4.5,
};

// Strip "//" keys used as inline comments in template JSON.
export function stripComments(obj) {
  if (Array.isArray(obj)) return obj.map(stripComments);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj)
      .filter(([k]) => !k.startsWith('//'))
      .map(([k, v]) => [k, stripComments(v)]));
  }
  return obj;
}
