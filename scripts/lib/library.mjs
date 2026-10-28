// The project's image library: every image gathered from the sources (pages, documents, decks,
// carousels, the user's own files), de-duplicated, measured and listed in images/library.json with a
// numbered contact sheet (images/library.png) that can be viewed in one go during analysis.
// Claude fills `description`, `tags`, `focus` (the subject, as a CSS object-position), `quality` and `use`
// after looking at each image; third-party images get `approved: true` only after the user's yes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const MIN_SIDE = 300;          // shorter side in px; smaller = icons, avatars, thumbnails
const PHOTO_ENTROPY = 6.5;     // greyscale entropy above this reads as a photograph

// 64-bit difference hash: catches the same picture saved at different sizes or qualities.
async function dhash(file) {
  const px = await sharp(file).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
  return bits;
}
const hamming = (a, b) => [...a].reduce((n, c, i) => n + (c !== b[i]), 0);
const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// incoming: [{ file, origin, source, context, rights }] for images just gathered. Files already in
// images/ without an entry are added as the user's own. Existing annotations are kept.
export async function buildLibrary(outDir, incoming = []) {
  const IMG = path.join(outDir, 'images');
  fs.mkdirSync(IMG, { recursive: true });
  const libFile = path.join(IMG, 'library.json');
  const prev = fs.existsSync(libFile) ? JSON.parse(fs.readFileSync(libFile, 'utf8')) : { images: [], excluded: [] };
  const known = new Map(prev.images.map(e => [e.file, e]));
  const meta = new Map(incoming.map(e => [path.resolve(e.file), e]));

  const files = fs.readdirSync(IMG).filter(f => IMAGE.test(f) && f !== 'library.png').map(f => path.join(IMG, f));
  const entries = [], excluded = [...(prev.excluded || [])];
  for (const file of files) {
    const rel = path.relative(outDir, file).replace(/\\/g, '/');
    const old = known.get(rel) || {};
    const info = meta.get(path.resolve(file)) || {};
    let m;
    try { m = await sharp(file).metadata(); } catch { excluded.push({ file: rel, reason: 'unreadable image' }); continue; }
    const w = m.width || 0, h = m.height || 0;
    if (m.format !== 'svg' && Math.min(w, h) < MIN_SIDE) {
      fs.mkdirSync(path.join(IMG, '_small'), { recursive: true });
      fs.renameSync(file, path.join(IMG, '_small', path.basename(file)));
      excluded.push({ file: `images/_small/${path.basename(file)}`, reason: `too small (${w}×${h})` });
      continue;
    }
    const st = m.format === 'svg' ? { entropy: 0, dominant: { r: 0, g: 0, b: 0 } } : await sharp(file).stats();
    entries.push({
      id: old.id, file: rel,
      origin: info.origin || old.origin || 'folder', source: info.source || old.source || 'added to images/',
      context: info.context ?? old.context ?? '', rights: info.rights || old.rights || 'own',
      width: w, height: h, orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square',
      kind: m.format === 'svg' ? 'graphic' : st.entropy >= PHOTO_ENTROPY ? 'photo' : 'graphic',
      entropy: +st.entropy.toFixed(2), dominant: hex(st.dominant), bytes: fs.statSync(file).size,
      sha: crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16),
      hash: m.format === 'svg' ? null : await dhash(file),
      // Annotations from analysis and planning survive rebuilds.
      description: old.description || '', tags: old.tags || [], focus: old.focus || '50% 50%',
      quality: old.quality || '', use: old.use ?? null, cutout: old.cutout ?? null, approved: old.approved ?? (info.rights || old.rights || 'own') === 'own',
    });
  }

  // De-duplicate: identical files, then near-identical pictures (keep the largest).
  entries.sort((a, b) => b.width * b.height - a.width * a.height);
  const kept = [];
  for (const e of entries) {
    const dup = kept.find(k => k.sha === e.sha || (k.hash && e.hash && hamming(k.hash, e.hash) <= 4));
    if (dup) {
      if (!dup.source.includes(e.source)) dup.source += `; ${e.source}`;
      fs.rmSync(path.join(outDir, e.file), { force: true });
      excluded.push({ file: e.file, reason: `duplicate of ${dup.file}` });
    } else kept.push(e);
  }

  // Stable ids: keep old ones, number new ones after the highest.
  let next = Math.max(0, ...kept.map(e => Number(String(e.id || '').replace('img-', '')) || 0));
  kept.sort((a, b) => (a.id || 'zzz').localeCompare(b.id || 'zzz') || a.file.localeCompare(b.file));
  for (const e of kept) if (!e.id) e.id = `img-${String(++next).padStart(2, '0')}`;
  kept.sort((a, b) => a.id.localeCompare(b.id));
  for (const e of kept) delete e.hash;

  fs.writeFileSync(libFile, JSON.stringify({ generatedAt: new Date().toISOString(), images: kept, excluded: dedupeExcluded(excluded) }, null, 2) + '\n');
  if (kept.length) await contactSheet(outDir, kept, path.join(IMG, 'library.png'));
  return kept;
}

const dedupeExcluded = list => [...new Map(list.map(e => [e.file, e])).values()];

// Numbered thumbnails with size and kind, so the whole library can be looked at at once.
async function contactSheet(outDir, list, out) {
  const box = 260, label = 34, gap = 12, cols = Math.min(5, list.length);
  const rows = Math.ceil(list.length / cols);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const tiles = [];
  for (const [i, e] of list.entries()) {
    const x = gap + (i % cols) * (box + gap), y = gap + Math.floor(i / cols) * (box + label + gap);
    try {
      tiles.push({ input: await sharp(path.join(outDir, e.file)).resize(box, box, { fit: 'contain', background: '#1c1c1e' }).flatten({ background: '#1c1c1e' }).png().toBuffer(), left: x, top: y });
    } catch { /* unreadable thumbnail: label only */ }
    const text = `${e.id}  ${e.width}×${e.height}  ${e.kind}${e.rights !== 'own' ? '  3rd-party' : ''}`;
    tiles.push({ input: Buffer.from(`<svg width="${box}" height="${label}" xmlns="http://www.w3.org/2000/svg"><text x="2" y="24" font-family="Arial, sans-serif" font-size="17" fill="#e5e5ea">${esc(text)}</text></svg>`), left: x, top: y + box });
  }
  await sharp({ create: { width: gap + cols * (box + gap), height: gap + rows * (box + label + gap), channels: 3, background: '#0d0d0f' } })
    .composite(tiles).png().toFile(out);
}
