# The composition: contract

A video is **one file**, `<motion-dir>/composition.html`, with **one master GSAP timeline**. `scripts/render.mjs` depends on this contract. Break it and the render report flags it.

## File
- The canvas is the project's ratio (`meta.json → ratio`; 9:16 = 1080×1920; see `aspect-ratios.md`). The root element is `<div class="scene" data-scene="1">`, sized to the canvas exactly.
- `<head>` has one `<style>` block that starts with the two placeholders, then your CSS:
  ```html
  <style>
  {{FONT_FACES}}
  {{TOKENS}}
  /* your CSS */
  </style>
  ```
  The renderer adds:
  - the brand's `@font-face` rules and `:root` tokens;
  - GSAP with the MorphSVG, DrawSVG, MotionPath and SplitText plugins registered;
  - the curves the composition uses;
  - `window.__motion` (the brand's motion tokens, plus any `meta.json → motion` overrides);
  - `--motion-*` CSS vars;
  - `splitWords()`, `fitText(selector, widthPx, maxPx)` (display type sized to a width, re-run once the brand fonts load) and `window.motionKit` (seeded noise, springs, follow-through, camera and focus: `motion-craft.md`).

  Never load anything from a URL.
- Images by relative path from the composition: `<img data-photo src="images/<file>">`.

## Tokens
- **Brand look:** only the brand's tokens: `var(--brand-<colour>)`, `var(--brand-font-<role>)`, `var(--brand-size-<level>)`, `var(--brand-space-<key>)`. No raw hex outside them; only font weights that exist as files.
- **Display type is sized from the canvas** (`video-logic.md` §3b). When a short phrase is the hero, set its `font-size` in px so it spans the full measure, e.g. about 900px of a 1080 canvas. It can go well above `--brand-size-hook`, in the brand's heading font and colours. It stays the largest text (`data-text="headline"`), and its readable part stays inside the safe zone. Body-level text keeps the brand's size tokens.
- **Layout in zones:** build each read moment's layout from `plan.reads[].layout`. Full-bleed grounds and heroes bleed past the canvas (negative offsets, `object-fit:cover`), and overlapping layers are ordered in the markup from back to front. `templates/composition.html` shows the structure.
- **Motion:** only the brand's motion tokens, as `window.__motion`:
  - `ease.enter | exit | move | fade | ambient | cutOut | cutIn`;
  - `duration.enter | exit | move | cut | stagger`;
  - `distance`, `readingSpeed`, `visual`.

  Handovers and the ambient layer aren't tokens; they're chosen for each video, in its plan (`plan.sequences[].handover`) and composition.

  If they're missing, the renderer stops and asks for the motion setup.
- **Curve names** accepted anywhere an ease goes:
  - GSAP eases;
  - `logistic(k)`;
  - `cubic-bezier(x1,y1,x2,y2)`;
  - for the last two, `.in` (first half, ends at peak speed) or `.out` (second half, starts at peak speed).

  An unknown name is an error.

## Markup
- **Text:** every text element gets `data-text`: `headline` | `key` | `support` | `item` | `clarifier` | `meta`.
  - At each read moment exactly one `headline` is visible and it's the largest text, unless the brand's `visual.headline` is `"optional"`.
  - Words on screen at a read moment stay within `visual.wordsPerBeat`.
- **Photos:** `<img data-photo …>` from the image library (`images.md`), cropped with `object-fit:cover; object-position:<focus>`.
- **Illustrations:** inline SVG; each illustration root gets `data-illustration`.
- **Decorative visuals:** `data-visual aria-hidden="true"`.
- **Decorative type** (repeated rows, giant background words, mask letters, tickers): `data-deco aria-hidden="true"` and **no** `data-text`. It may bleed off the canvas and into the platform zones; it counts towards filling the canvas, not towards the read checks (`type.md`).
- **Shapes and textures:** inline a shape from `templates/shapes/` (it takes `currentColor`, so colour it with a brand token) and mark it `data-shape="<name>"`; copy a texture from `templates/textures/textures.css` and mark it `data-texture="<name>"`. Textures count as ground, not content. The brand's design language can rule either out.
- **Archetype containers:** group each sequence's elements in one container named for its archetype (`<div class="seq s1" data-archetype="type-wall">`), layers ordered back to front (`layouts.md`, `templates/archetypes/`).
- **Logo:** `<img data-logo src="{{LOGO}}">` (or `{{LOGO_ALT}}`).

## Depth (2.5D)
Layouts read as layered space through CSS perspective and 3D transforms only (no WebGL). The renderer sets `gsap.config({ force3D: false })`, so elements only get 3D when the composition asks for it (`rotationX/Y`, `z`, a perspective root); that keeps rasterisation, and so the output, byte-identical. The model is fixed:

| Plane | Contents | Parallax rate | Blur | Shadow |
|---|---|---|---|---|
| **Far** (`.plane-far`) | ground, textures, big background type | 0.3× | 4-12px when out of focus | none |
| **Mid** (`.plane-mid`) | cards, images, cut-outs | 1.0× | 0 | soft, larger and fainter the further back |
| **Near** (`.plane-near`) | read text, stickers, foreground accents | 1.4× | 0: text never blurs during a read | tight |

```html
<div class="scene" data-scene="1">
  <div class="depth-root" style="position:absolute;inset:0;perspective:2000px">
    <div class="camera" style="position:absolute;inset:0;transform-style:preserve-3d">
      <div class="plane-far"  style="position:absolute;inset:-10%"> … </div>
      <div class="plane-mid"  style="position:absolute;inset:0"> … </div>
      <div class="plane-near" style="position:absolute;inset:0"> … </div>
    </div>
  </div>
</div>
```

- **The camera moves the planes, not the scene.** `motionKit.camera(tl, 'push' | 'pull' | 'pan' | 'orbit', { at, duration, ease, amount, x, y })` moves each plane at its rate, so a push separates the layers.
- **Focus pulls** use `motionKit.focus(tl, 'far', 8, { at, duration, ease })` to blur a background plane while a mid element takes the eye (e.g. a blurred year behind a subject). The near plane never blurs.
- **Read text lives on the near plane** (or on an unblurred mid plane in front of everything blurred). The renderer errors on read text that is blurred, or that sits inside a blurred plane, at a read moment (`blur-on-read`).
- **Oversize the far plane** (`inset:-10%` or more) so pans and pulls never reveal its edge.
- **Record the layer map** in `plan.depth` (`{ "far": […], "mid": […], "near": […] }`).
- Depth is optional for flat, graphic layouts, but most expressive archetypes gain from it.

## The master timeline
Build the video as **sequences**: functions that each add one stretch of motion to the master timeline at a time you choose, overlapping the others. Elements can be shared between sequences.

```html
<script>
const M = window.__motion, D = M.duration, E = M.ease;
const tl = gsap.timeline({ paused: true });

// Each sequence adds its tweens at absolute times (seconds) on the master timeline.
function ambient(t0, t1) {
  tl.fromTo('#ground', { scale: 1 }, { scale: 1.05, duration: t1 - t0, ease: E.ambient }, t0);
}
function opening(t) {
  tl.from('#hook .w', { y: M.distance, opacity: 0, duration: D.enter, ease: E.enter, stagger: D.stagger }, t)
    .from('#chart', { scaleX: 0, duration: 2.4, ease: E.move }, t + 0.2)      // keeps growing through the read
    .addLabel('hold', t + 0.9);                                                // text settled: read moment
}
function second(t) {
  tl.to('#hook', { y: -M.distance, opacity: 0, duration: D.exit, ease: E.exit }, t)
    .to('#chart', { x: -300, scale: 0.6, duration: D.move, ease: E.move }, t)  // the chart carries on, smaller
    .from('#point2', { y: M.distance, opacity: 0, duration: D.enter, ease: E.enter }, t + 0.2)
    .addLabel('hold2', t + 1.0);
}

ambient(0, 15);
opening(0);
second(2.6);     // starts while opening's chart is still moving
// …
tl.addLabel('end', 15);
window.__scene = { tl };
</script>
```

Labels the renderer reads:
- `hold`, `hold2`, `hold3`… mark **read moments**: text fully on screen and settled. Each is checked like a carousel slide (layout, budget, hierarchy, contrast, safe zone) and must stay still for its reading time. Its reading time counts only the words it adds.
- `cut`, `cut2`… mark **hard cuts** (optional). The renderer makes `cuts.png` from two frames before and after each, to check that the motion carries across.

Mechanics:
- The video's length is `tl.duration()`. End it with a tween or label at the last second, and keep something moving to the end.
- `.from()` renders its start state at time 0, so elements meant to appear later must start hidden (`.from`, or initial CSS `opacity:0` plus a `.set`/`.to`).
- **Hard cut inside the composition:** at the cut time, `.set` the outgoing group to `display:none` or `opacity:0` and the incoming group visible. For a match cut, put the outgoing move on `E.cutOut` ending at the cut, and the incoming move on `E.cutIn` starting at it.
- `SplitText.create(selector, { type: 'lines,words,chars', mask: 'lines' })` splits text for per-line, per-word and per-character treatments (`type.md`); `splitWords(selector)` wraps each word in `<span class="mw">`.
- Randomness only through `motionKit.rng(seed)` / `noise(seed)` / `wobble(…, { seed })`.
- Counters: tween a plain object and write the text in `onUpdate` (it runs on every seek).

## Checks (errors unless noted)
- **Continuous motion:** any stretch over 0.3s with no tween running. Padding such as `.to({}, {duration})` doesn't count.
- **Determinism:**
  - no CSS `@keyframes`, `animation` or `transition`;
  - no `requestAnimationFrame` or timers;
  - no `<video>`, `<audio>` or `<iframe>`;
  - no tweens outside `window.__scene.tl`;
  - `Math.random`, or a `motionKit` noise helper called without a seed.
- **Read moments:** at least one `hold`. Each is checked for text holding still and for reading time.
- **Visual rules:** from `motion.json → visual`.
  - Words per read moment, and the headline rule.
  - An illustration at every read moment if `requires` is `"illustration"` (warning).
  - Photos if `requires` is `"photo"` or `meta.json → useImages` is set (warning).
- **Images:** a warning when a photo is shown above 1.5× its own pixels. An error when a third-party image is used that isn't `approved` in `images/library.json`.
- **Length:** a warning when the video is more than 1s (or 10%) off its target.
