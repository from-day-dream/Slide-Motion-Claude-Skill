#!/usr/bin/env node
// Rebuild <workspace>/motion/index.json from motion/*/ and refresh <workspace>/gallery.html, the
// viewer shared with Carousel Studio (its Motion tab lists these videos).
//
//   node gallery.mjs [--workspace <path>]                 rebuild index + viewer
//   node gallery.mjs --serve [--port 4173] [--workspace]  rebuild, then serve the workspace on localhost
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, parseArgs, fail, readJSON, writeJSON, resolveWorkspace } from './lib/workspace.mjs';
import { serve } from './lib/serve.mjs';

const args = parseArgs();
const ws = resolveWorkspace(args);
const motionDir = path.join(ws, 'motion');
if (!fs.existsSync(motionDir)) fail(`no motion folder in ${ws} - render a video first`);

const rel = p => path.relative(ws, p).replace(/\\/g, '/');
const bust = p => `${rel(p)}?v=${Math.round(fs.statSync(p).mtimeMs)}`;
const readText = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '');

function entry(folder) {
  const dir = path.join(motionDir, folder);
  const video = path.join(dir, 'video.mp4');
  const report = readJSON(path.join(dir, 'render-report.json'), null);
  if (!fs.existsSync(video) || !report) return null;
  const meta = readJSON(path.join(dir, 'meta.json'), {});

  // One composition per video: the gallery jumps between its read moments.
  const moments = report.moments || [];
  const ideas = meta.plan?.ideas || [];
  const scenes = moments.map((m, i) => {
    const idea = ideas[i] || {};
    const next = i + 1 < moments.length ? moments[i + 1].t : report.duration;
    return {
      n: i + 1, start: Math.max(0, +(m.t - 0.4).toFixed(3)), duration: +(next - m.t).toFixed(3), hold: m.holdFor,
      png: bust(path.join(dir, m.png)),
      headline: (idea.copy || [])[0] || idea.idea || m.slide,
      body: (idea.copy || []).slice(1).join('\n'),
      beat: idea.visual || '',
    };
  });
  const date = folder.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || (meta.createdAt || '').slice(0, 10);
  const poster = path.join(dir, 'poster.png');
  return {
    id: folder, date, createdAt: meta.createdAt || date,
    title: meta.title || meta.topic || folder, topic: meta.topic || '', brand: meta.brand || report.brand || '',
    style: '',
    ratio: report.ratio, width: report.width, height: report.height, fps: report.fps, duration: report.duration,
    source: meta.source?.carousel ? path.basename(meta.source.carousel) : '',
    caption: readText(path.join(dir, 'caption.txt')) || [meta.caption, (meta.hashtags || []).join(' ')].filter(Boolean).join('\n\n'),
    video: bust(video),
    poster: fs.existsSync(poster) ? bust(poster) : null,
    report: report.summary,
    scenes,
  };
}

const videos = fs.readdirSync(motionDir, { withFileTypes: true }).filter(d => d.isDirectory())
  .map(d => entry(d.name)).filter(Boolean)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));

writeJSON(path.join(motionDir, 'index.json'), { generatedAt: new Date().toISOString(), videos });
fs.copyFileSync(path.join(SKILL_DIR, 'templates', 'gallery.html'), path.join(ws, 'gallery.html'));
console.log(`Indexed ${videos.length} video(s) → ${path.join(motionDir, 'index.json')}`);

if (args.serve) serve(ws, Number(args.port) || 4173);
