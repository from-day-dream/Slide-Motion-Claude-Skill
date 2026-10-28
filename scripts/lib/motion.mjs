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

// fitText(selector, width, max): sets each element's font-size so its text spans `width` px (display
// type sized from the canvas, video-logic.md §3b). Uses layout width, so transforms don't skew it; the
// renderer runs every fit again once the brand fonts have loaded.
const FIT_TEXT = `window.fitText=function(sel,w,max){var els=[].slice.call(document.querySelectorAll(sel));function run(){els.forEach(function(el){el.style.fontSize='100px';var r=el.offsetWidth||1;el.style.fontSize=Math.min(max||9999,100*w/r)+'px'})}run();(window.__fits=window.__fits||[]).push(run);return els};`;

// motionKit: deterministic craft helpers (references/motion-craft.md, composition.md → Depth).
//   rng(seed)                  seeded PRNG (mulberry32) → () => [0,1). Never Math.random.
//   noise(seed)                smooth 1D value noise → x => [-1,1]
//   wobble(tl, targets, o)     seeded drift on x/y/rotation: { seed, at, duration, x, y, rotation, rate }
//   spring(o)                  registers a damped spring ease { stiffness, damping, mass } and returns its name
//   offsetProps(tl, el, p, o)  position leads, rotation/scale/other props lag by o.lag (default 0.08s)
//   camera(tl, move, o)        push | pull | pan | orbit: moves .plane-far/.plane-mid/.plane-near at 0.3×/1×/1.4×;
//                              o.settle: start moved and arrive at rest (the layout as designed) instead
//   focus(tl, plane, px, o)    depth-of-field pull: blurs one plane ("far", "mid"); never the read text
//   grain(tl, canvas, o)       seeded film grain redrawn every frame: { seed, duration, amount, scale, fps }
// Every seeded helper throws without a seed, so randomness can't slip in unseeded.
const MOTION_KIT = `(function(){
function need(seed,fn){if(typeof seed!=='number'||!isFinite(seed))throw new Error('motionKit.'+fn+': a numeric seed is required');}
function rng(seed){need(seed,'rng');var a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function hash(seed,i){return rng(((seed*2654435761)^(i*40503))>>>0)();}
function noise(seed){need(seed,'noise');return function(x){var i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return (hash(seed,i)*(1-u)+hash(seed,i+1)*u)*2-1;};}
function wobble(tl,targets,o){o=o||{};need(o.seed,'wobble');var els=gsap.utils.toArray(targets),rate=o.rate||1.5,dur=o.duration||1,at=o.at||0;
  els.forEach(function(el,k){var nx=noise(o.seed+k*101),ny=noise(o.seed+k*101+37),nr=noise(o.seed+k*101+71),steps=Math.max(2,Math.round(dur*rate)),kf=[];
    for(var s=1;s<=steps;s++){var p=s/rate;kf.push({x:(o.x||0)*nx(p),y:(o.y||0)*ny(p),rotation:(o.rotation||0)*nr(p),duration:dur/steps,ease:'sine.inOut'});}
    tl.to(el,{keyframes:kf},at);});return tl;}
function spring(o){o=o||{};var k=o.stiffness||170,c=o.damping||18,m=o.mass||1,w=Math.sqrt(k/m),z=c/(2*Math.sqrt(k*m)),name='spring('+k+','+c+','+m+')';
  if(gsap.parseEase(name)&&gsap.parseEase(name)!==gsap.parseEase('none'))return name;
  var T=-Math.log(0.001)/(z*w),f;
  if(z<1){var wd=w*Math.sqrt(1-z*z);f=function(t){return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t));};}
  else{f=function(t){return 1-(1+w*t)*Math.exp(-w*t);};T=-Math.log(0.001)/w*1.5;}
  gsap.registerEase(name,function(p){return p>=1?1:f(p*T);});return name;}
var POS={x:1,y:1,xPercent:1,yPercent:1,left:1,top:1,motionPath:1};
function offsetProps(tl,el,props,o){o=o||{};var lead={},lag={},at=o.at||0,base={duration:o.duration,ease:o.ease};
  Object.keys(props).forEach(function(p){(POS[p]?lead:lag)[p]=props[p];});
  if(Object.keys(lead).length)tl.to(el,Object.assign({},base,lead),at);
  if(Object.keys(lag).length)tl.to(el,Object.assign({},base,lag),at+(o.lag===undefined?0.08:o.lag));return tl;}
var RATES={far:0.3,mid:1,near:1.4};
function camera(tl,move,o){o=o||{};var a=o.amount===undefined?0.1:o.amount,at=o.at||0;
  Object.keys(RATES).forEach(function(pl){var r=RATES[pl],v={duration:o.duration,ease:o.ease},els=document.querySelectorAll('.plane-'+pl);if(!els.length)return;
    if(move==='push')v.scale=1+a*r;else if(move==='pull')v.scale=1-a*r;
    else if(move==='pan'){v.x=-(o.x||0)*r;v.y=-(o.y||0)*r;}
    else if(move==='orbit'){v.rotationY=a*r;v.x=-(o.x||0)*r;}
    else throw new Error('motionKit.camera: push, pull, pan or orbit');
    (o.settle?tl.from:tl.to).call(tl,els,v,at);});return tl;}
function focus(tl,plane,px,o){o=o||{};if(plane==='near')throw new Error('motionKit.focus: the near plane holds the read text and never blurs');
  tl.to('.plane-'+plane,{filter:'blur('+px+'px)',duration:o.duration,ease:o.ease},o.at||0);return tl;}
function grain(tl,canvas,o){o=o||{};need(o.seed,'grain');var c=typeof canvas==='string'?document.querySelector(canvas):canvas,sc=o.scale||3,fps=o.fps||30,amt=o.amount===undefined?0.5:o.amount;
  c.width=Math.ceil(c.offsetWidth/sc);c.height=Math.ceil(c.offsetHeight/sc);var ctx=c.getContext('2d'),img=ctx.createImageData(c.width,c.height),last=-1,p={f:0};
  function draw(){var fr=Math.round(p.f);if(fr===last)return;last=fr;var r=rng(o.seed*7919+fr),d=img.data;for(var i=0;i<d.length;i+=4){var v=r()*255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255*amt;}ctx.putImageData(img,0,0);}
  draw();tl.fromTo(p,{f:0},{f:Math.round((o.duration||1)*fps),duration:o.duration||1,ease:'none',onUpdate:draw},o.at||0);return tl;}
window.motionKit={rng:rng,noise:noise,wobble:wobble,spring:spring,offsetProps:offsetProps,camera:camera,focus:focus,grain:grain,RATES:RATES};
})();`;

// Extra <head> content for the composition: GSAP (from node_modules, never a CDN), every curve the
// motion tokens and the composition use, the tokens as window.__motion, --motion-* vars, fitText(), motionKit and
// splitWords(). gsapSource carries GSAP plus the SVG plugins (MorphSVG, DrawSVG, MotionPath) and SplitText,
// registered here. The global timeline is paused so only the composition's own timeline, seeked by
// the renderer, moves.
export const GSAP_FILES = ['gsap.min.js', 'MorphSVGPlugin.min.js', 'DrawSVGPlugin.min.js', 'MotionPathPlugin.min.js', 'SplitText.min.js'];
export function motionHead(gsapSource, motion, sceneHtml = '') {
  const curves = curvesIn(JSON.stringify(motion.ease) + sceneHtml);
  const vars = [
    ...Object.entries(motion.duration).map(([k, v]) => `--motion-${k}:${v}s`),
    `--motion-distance:${motion.distance}px`,
  ].join(';');
  return `<script data-injected>${gsapSource}</script>
<script data-injected>gsap.registerPlugin(MorphSVGPlugin,DrawSVGPlugin,MotionPathPlugin,SplitText);${CURVES}${JSON.stringify(curves)}.forEach(registerCurve);window.__motion=${JSON.stringify(motion)};gsap.ticker.lagSmoothing(0);gsap.config({force3D:false});gsap.globalTimeline.pause();${SPLIT_WORDS}${FIT_TEXT}${MOTION_KIT}</script>
<style data-injected>:root{${vars}}</style>`;
}

// ---------- brand placeholders ----------

// The brand-neutral templates (templates/composition.html, templates/archetypes/) name colours and
// faces by role, never by value: BRAND_BACKGROUND, BRAND_TEXT, BRAND_COLOR_1… Bind each role to one of
// this brand's own tokens (as var(--brand-…)), so a template renders in the brand and nothing else.
const hexRGB = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lumOf = hex => hexRGB(hex).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const chroma = hex => { const c = hexRGB(hex); return Math.max(...c) - Math.min(...c); };
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function brandPlaceholders(tokens) {
  const cols = Object.entries(tokens.colors || {}).map(([name, c]) => ({
    name, v: `var(--brand-${kebab(name)})`, hex: typeof c === 'string' ? c : c.value, role: String((typeof c === 'string' ? '' : c.role) || '').toLowerCase(),
  })).filter(c => /^#[0-9a-f]{3,8}$/i.test(c.hex));
  if (!cols.length) fail('tokens.json has no colours to bind the template to', 2);
  const is = r => cols.filter(c => c.role === r);
  const best = (list, against) => [...list].sort((a, b) => contrast(b.hex, against.hex) - contrast(a.hex, against.hex))[0];
  const bg = is('background')[0] || cols[0];
  const text = best(is('text').length ? is('text') : cols, bg);
  const muted = is('text').find(c => c !== text && contrast(c.hex, bg.hex) >= 3) || text;
  const accent = is('accent')[0] || text;
  const onAccent = best([...is('background'), ...is('text')].length ? [...is('background'), ...is('text')] : cols, accent);
  const surface = is('background')[1] || is('panel')[0] || bg;
  const accent2 = is('accent')[1] || is('panel')[0] || accent;
  const dark = [...cols].sort((a, b) => lumOf(a.hex) - lumOf(b.hex))[0];
  // Decorative palette: the brand's colourful non-text colours that the text colour still reads on.
  let palette = cols.filter(c => c !== bg && c.role !== 'text' && contrast(c.hex, text.hex) >= 4.5 && chroma(c.hex) > 20).sort((a, b) => chroma(b.hex) - chroma(a.hex));
  if (!palette.length) palette = [surface, accent2, accent];
  const map = {
    BRAND_BACKGROUND: bg.v, BRAND_SURFACE: surface.v, BRAND_TEXT: text.v, BRAND_MUTED: muted.v, BRAND_DARK: dark.v,
    BRAND_ACCENT: accent.v, BRAND_ACCENT_2: accent2.v, BRAND_ON_ACCENT: onAccent.v,
  };
  for (let i = 0; i < 4; i++) map[`BRAND_COLOR_${i + 1}`] = palette[i % palette.length].v;
  // Faces: display (heading), body, and a second face for mixed lockups (the accent face if the brand has one).
  const F = tokens.fonts || {};
  const role = r => (F[r] ? r : null);
  const display = role('heading') || Object.keys(F)[0], body = role('body') || display, second = role('accent') || body;
  const files = r => (F[r]?.files || []);
  const italic = files(second).some(f => f.style === 'italic');
  const maxW = (r, style) => Math.max(400, ...files(r).filter(f => !style || f.style === style).map(f => Number(f.weight) || 400));
  Object.assign(map, {
    BRAND_FONT_DISPLAY: `var(--brand-font-${kebab(display)})`, BRAND_FONT_BODY: `var(--brand-font-${kebab(body)})`,
    BRAND_FONT_SECOND: `var(--brand-font-${kebab(second)})`, BRAND_SECOND_STYLE: italic ? 'italic' : 'normal',
    BRAND_WEIGHT_DISPLAY: String(maxW(display)), BRAND_WEIGHT_SECOND: String(maxW(second, italic ? 'italic' : 'normal')),
    BRAND_GUTTER: `${Number(tokens.spacing?.gutter) || 24}px`,
  });
  return map;
}

export function fillPlaceholders(html, tokens) {
  const map = brandPlaceholders(tokens);
  const out = html.replace(/\bBRAND_[A-Z0-9_]+\b/g, k => map[k] ?? k);
  const left = [...new Set(out.match(/\bBRAND_[A-Z0-9_]+\b/g) || [])];
  if (left.length) fail(`unknown template placeholder(s): ${left.join(', ')}`, 2);
  return out;
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
