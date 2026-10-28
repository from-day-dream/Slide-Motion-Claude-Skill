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
  - GSAP with the MorphSVG, DrawSVG and MotionPath plugins registered;
  - the curves the composition uses;
  - `window.__motion` (the brand's motion tokens, plus any `meta.json → motion` overrides);
  - `--motion-*` CSS vars, and `splitWords()`.

  Never load anything from a URL.
- Images by relative path from the composition: `<img data-photo src="images/<file>">`.

## Tokens
- **Brand look:** only the brand's tokens: `var(--brand-<colour>)`, `var(--brand-font-<role>)`, `var(--brand-size-<level>)`, `var(--brand-space-<key>)`. No raw hex outside them; only font weights that exist as files.
- **Motion:** only the brand's motion tokens, as `window.__motion`:
  - `ease.enter | exit | move | fade | ambient | cutOut | cutIn`;
  - `duration.enter | exit | move | cut | stagger`;
  - `distance`, `readingSpeed`, `imageMotion`, `visual`, `techniques`.

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
- **Logo:** `<img data-logo src="{{LOGO}}">` (or `{{LOGO_ALT}}`).

## The master timeline
Build the video as **sequences**: functions that each add one stretch of motion to the master timeline at a time you choose, overlapping the others. Elements can be shared between sequences.

```html
<script>
const M = window.__motion, D = M.duration, E = M.ease;
const tl = gsap.timeline({ paused: true });

// Each sequence adds its tweens at absolute times (seconds) on the master timeline.
function ambient(t0, t1) {
  tl.fromTo('#ground', { scale: 1 }, { scale: M.imageMotion.zoom, duration: t1 - t0, ease: E.ambient }, t0);
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
- `splitWords(selector)` wraps each word in `<span class="mw">` for staggered text.
- Counters: tween a plain object and write the text in `onUpdate` (it runs on every seek).

## Checks (errors unless noted)
- **Continuous motion:** any stretch over 0.3s with no tween running. Padding such as `.to({}, {duration})` doesn't count.
- **Determinism:**
  - no CSS `@keyframes`, `animation` or `transition`;
  - no `requestAnimationFrame` or timers;
  - no `<video>`, `<audio>` or `<iframe>`;
  - no tweens outside `window.__scene.tl`;
  - `Math.random` is a warning.
- **Read moments:** at least one `hold`. Each is checked for text holding still and for reading time.
- **Visual rules:** from `motion.json → visual`.
  - Words per read moment, and the headline rule.
  - An illustration at every read moment if `requires` is `"illustration"` (warning).
  - Photos if `requires` is `"photo"` or `meta.json → useImages` is set (warning).
- **Images:** a warning when a photo is shown above 1.5× its own pixels. An error when a third-party image is used that isn't `approved` in `images/library.json`.
- **Length:** a warning when the video is more than 1s (or 10%) off its target.
