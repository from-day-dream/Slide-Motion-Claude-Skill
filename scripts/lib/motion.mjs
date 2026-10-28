// Motion-specific helpers: aspect ratios, platform safe zones, the brand's motion tokens and curves.
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readJSON, stripComments, fail } from './workspace.mjs';

const RATIOS = stripComments(readJSON(path.join(SKILL_DIR, 'config', 'ratios.json')));
export const DEFAULT_RATIO = RATIOS.default;
export const DEFAULT_DURATION = RATIOS.duration;

// Target length: --duration, then meta.json → duration (what the user asked for), then the default (15s).
export const targetDuration = (args = {}, meta = {}) => Number(args.duration) || Number(meta.duration) || DEFAULT_DURATION;

const even = n => Math.round(n / 2) * 2;

// "9:16" (preset) or any "W:H" / "WxH". Custom ratios keep 1080 on the short side.
export function resolveRatio(spec = DEFAULT_RATIO) {
  spec = String(spec).replace('x', ':');
  if (RATIOS.presets[spec]) return { name: spec, ...RATIOS.presets[spec] };
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(spec);
  if (!m) fail(`unknown aspect ratio "${spec}" - use W:H, e.g. 9:16, 1:1, 16:9, 2:3`, 2);
  const a = Number(m[1]), b = Number(m[2]);
  const [width, height] = a >= b ? [even((1080 * a) / b), 1080] : [1080, even((1080 * b) / a)];
  if (Math.max(width, height) > 3840) fail(`aspect ratio ${spec} is too extreme (${width}×${height})`, 2);
  return { name: spec, width, height, safe: { top: 72, right: 72, bottom: 72, left: 72 }, use: 'custom' };
}

// Folder-safe tag: "9:16" -> "9x16".
export const ratioTag = name => name.replace(':', 'x');

// Platform zones, widened to the brand's own safe area where that is larger.
export function safeZone(ratio, brandSafe, platform = true) {
  if (!platform) return brandSafe;
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(k => [k, Math.max(ratio.safe[k], brandSafe)]));
}

// ---------- motion tokens ----------

// The skill ships no style. How a brand moves (curves, timings) and what it shows (words per read
// moment, whether a headline is required, photos/illustrations) is defined with the user at setup, in
// brands/<slug>/motion.json. A video may override or supply any of it in meta.json → motion.
// How ideas hand over, and what keeps the frame alive, are never tokens: they're chosen per video.
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
};
export const REQUIRED = {
  ease: ['enter', 'exit', 'move', 'fade', 'ambient', 'cutOut', 'cutIn'],
  duration: ['enter', 'exit', 'move', 'cut', 'stagger'],
};
const VISUAL_DEFAULTS = { wordsPerBeat: 7, headline: 'required', requires: null, maxVisuals: 2 };

function missingTokens(m) {
  const miss = [];
  for (const k of REQUIRED.ease) if (!(typeof m.ease?.[k] === 'string' && m.ease[k].trim())) miss.push(`ease.${k}`);
  for (const k of REQUIRED.duration) if (!(Number(m.duration?.[k]) > 0)) miss.push(`duration.${k}`);
  if (!(Number(m.distance) > 0)) miss.push('distance');
  return miss;
}

// Returns the tokens, or null with a reason when they're missing or incomplete (soft) / fails (strict).
export function loadMotion(brandDir, videoMotion, { strict = true } = {}) {
  const file = path.join(brandDir, 'motion.json');
  const own = fs.existsSync(file) ? stripComments(readJSON(file)) : null;
  const m = merge(own || {}, videoMotion || {});
  const miss = missingTokens(m);
  if (miss.length) {
    const why = own || videoMotion
      ? `motion tokens incomplete (${miss.join(', ')}) in ${own ? file : 'meta.json → motion'}`
      : `brand "${path.basename(brandDir)}" has no motion.json`;
    if (!strict) return null;
    fail(`${why} - define how the brand moves with the user first (references/brand-setup.md → Motion setup)`, 2);
  }
  m.visual = { ...VISUAL_DEFAULTS, ...(m.visual || {}) };
  m.readingSpeed = Number(m.readingSpeed) || 3.5;
  m.imageMotion = { zoom: 1, pan: 0, ...(m.imageMotion || {}) };
  delete m.techniques; // older motion.json files may still carry a handover list; it's ignored
  m.source = own && videoMotion ? 'brand + video' : own ? 'brand' : 'video';
  return m;
}

// ---------- curves ----------

// Curve names beyond GSAP's own: logistic(k) and cubic-bezier(x1,y1,x2,y2), each with .in / .out halves.
const CURVE_RE = /(logistic\(\s*[\d.]+\s*\)|cubic-bezier\(\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*,\s*[-\d.]+\s*\))(\.(?:in|out))?/g;
export const curvesIn = text => [...new Set([...String(text).matchAll(CURVE_RE)].map(m => m[0].replace(/\s+/g, '')))];

// Runs in the page after GSAP: builds each named curve and registers it under its exact name.
const CURVES = `(function(){
var sig=function(x){return 1/(1+Math.exp(-x))};
function logistic(k){var a=sig(-k/2),b=sig(k/2);return function(t){return (sig(k*(t-0.5))-a)/(b-a)}}
function bezier(x1,y1,x2,y2){
  var cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  var X=function(t){return ((ax*t+bx)*t+cx)*t},Y=function(t){return ((ay*t+by)*t+cy)*t},D=function(t){return (3*ax*t+2*bx)*t+cx};
  return function(x){if(x<=0)return 0;if(x>=1)return 1;var t=x,i;
    for(i=0;i<8;i++){var e=X(t)-x,d=D(t);if(Math.abs(e)<1e-7)return Y(t);if(Math.abs(d)<1e-6)break;t-=e/d}
    var lo=0,hi=1;t=x;for(i=0;i<50;i++){if(X(t)<x)lo=t;else hi=t;t=(lo+hi)/2}return Y(t)}}
function half(f,side){var m=f(0.5);return side==='in'?function(t){return f(t/2)/m}:function(t){return (f(0.5+t/2)-m)/(1-m)}}
window.registerCurve=function(name){
  var m=/^(logistic|cubic-bezier)\\(([^)]*)\\)(?:\\.(in|out))?$/.exec(name);if(!m)return;
  var p=m[2].split(',').map(Number),f=m[1]==='logistic'?logistic(p[0]):bezier(p[0],p[1],p[2],p[3]);
  gsap.registerEase(name,m[3]?half(f,m[3]):f)};
})();`;

// splitWords(selector): wraps every word inside the matched elements (emphasis spans included)
// in <span class="mw"> so a timeline can stagger them. Returns the spans in reading order.
const SPLIT_WORDS = `window.splitWords=function(sel){const out=[];document.querySelectorAll(sel).forEach(function(el){(function walk(n){[].slice.call(n.childNodes).forEach(function(c){if(c.nodeType===1)return walk(c);if(c.nodeType!==3)return;const f=document.createDocumentFragment();c.textContent.split(/(\\s+)/).forEach(function(p){if(!p)return;if(/^\\s+$/.test(p)){f.append(p);return}const s=document.createElement('span');s.className='mw';s.style.display='inline-block';s.textContent=p;f.append(s);out.push(s)});c.replaceWith(f)})})(el)});return out};`;

// Extra <head> content for the composition: GSAP (from node_modules, never a CDN), every curve the
// motion tokens and the composition use, the tokens as window.__motion, --motion-* vars, and
// splitWords(). gsapSource carries GSAP plus the SVG plugins (MorphSVG, DrawSVG, MotionPath),
// registered here. The global timeline is paused so only the composition's own timeline, seeked by
// the renderer, moves.
export const GSAP_FILES = ['gsap.min.js', 'MorphSVGPlugin.min.js', 'DrawSVGPlugin.min.js', 'MotionPathPlugin.min.js'];
export function motionHead(gsapSource, motion, sceneHtml = '') {
  const curves = curvesIn(JSON.stringify(motion.ease) + sceneHtml);
  const vars = [
    ...Object.entries(motion.duration).map(([k, v]) => `--motion-${k}:${v}s`),
    `--motion-distance:${motion.distance}px`,
  ].join(';');
  return `<script data-injected>${gsapSource}</script>
<script data-injected>gsap.registerPlugin(MorphSVGPlugin,DrawSVGPlugin,MotionPathPlugin);${CURVES}${JSON.stringify(curves)}.forEach(registerCurve);window.__motion=${JSON.stringify(motion)};gsap.ticker.lagSmoothing(0);gsap.globalTimeline.pause();${SPLIT_WORDS}</script>
<style data-injected>:root{${vars}}</style>`;
}

// Pull each hierarchy level's text out of a slide's HTML (tags stripped, the <em> word kept apart).
export function readSlide(html) {
  const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const levels = {};
  for (const m of html.matchAll(/<([a-z0-9]+)[^>]*data-text="([a-z]+)"[^>]*>([\s\S]*?)<\/\1>/gi)) {
    (levels[m[2]] ||= []).push(m[3]);
  }
  const head = levels.headline?.[0] || '';
  return {
    headline: strip(head),
    emphasis: strip(/<em[^>]*>([\s\S]*?)<\/em>/i.exec(head)?.[1] || ''),
    key: strip(levels.key?.[0] || ''),
    support: strip(levels.support?.[0] || ''),
    items: (levels.item || []).map(strip),
    meta: (levels.meta || []).map(strip),
    image: /<img(?![^>]*data-logo)[^>]*src="\.\.\/(images\/[^"]+)"/i.exec(html)?.[1] || null,
  };
}
