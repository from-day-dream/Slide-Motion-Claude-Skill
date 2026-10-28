# Brand setup

Slide Motion and Carousel Studio share one workspace and one brand kit format: `<ws>/brands/<slug>/` (`brand.md`, `tokens.json`, `design-language.md`, `fonts/`, `logo/`, `images.json`, `layouts/`). Slide Motion adds one file, `motion.json` (how the brand moves and what its videos show, defined with the user), plus **Motion** and, if the brand uses illustrations, **Illustration** sections in `design-language.md`. The skill ships no style of its own: everything aesthetic comes from this setup. A brand set up in either skill works in both.

`<skill>` is this skill's folder; `<ws>` is the workspace (`$CAROUSEL_STUDIO_HOME` or `./carousel-studio`).

## Which path?
Run `node <skill>/scripts/setup.mjs --check`. Its `brands` list shows each brand with `motion`: `ready`, `incomplete` or `missing`.

| Situation | Do |
|---|---|
| `motion: ready` | Nothing. Use it. |
| `motion: missing` or `incomplete` (e.g. a brand set up in Carousel Studio) | **Motion setup** only (below). Don't re-interview anything else. |
| No brand | **Full setup** (steps 0-7), then the motion setup. |

Never change an existing brand's `tokens.json`, `brand.md` or fonts for the video; ask first if a motion choice seems to need it.

## Full setup
Ask in **small batches** (2-4 questions per message), never one long form. Accept pasted text, links (read the user's site or Instagram and summarise what it shows) and uploaded files. Draft answers yourself and ask the user to confirm.

### 0. Create the kit
```
node <skill>/scripts/setup.mjs --init --brand <slug>
```
Creates `<ws>/brands/<slug>/` from `templates/brand/` (Carousel Studio's format plus `motion.json`) and makes it active if none is. Slug: lowercase-dashes from the brand name.

### 1. Identity → `brand.md`
Name, handle, website. What the brand does and for whom (positioning), who watches (audience). If they give a link, read it and propose positioning + audience for them to correct.

### 2. Voice → `brand.md`
3-5 voice traits, each with a do/don't line. Words to use and to avoid. The exact closing CTA text for the end of a video (default: "Follow @handle for more <topic>").

### 3. Fonts → `tokens.json` + `fonts/`
For each role (`heading`, `body`, optional `accent`):
- **Google Font:** `node <skill>/scripts/fonts.mjs --family "<Family>" --weights 400,600 [--italic] --role heading --brand <slug>`. Download every weight and style the design will use.
- **User's own files:** copy into `fonts/` and add `{ "family", "files": [{ "path": "fonts/…", "weight": 600, "style": "normal" }] }` to `tokens.json`.
- Not sure: propose 2 pairings that fit the voice, render specimens for both, let them pick.

Render and **show** the specimen: `node <skill>/scripts/render.mjs --specimen --brand <slug>`. Exit 2 = a font failed; fix it first.

### 4. Logo → `logo/`
SVG preferred, transparent PNG accepted. Set `logo.primary` (light backgrounds) and `logo.alt` (dark).

### 5. Colours → `tokens.json`
At least `background`, `text` and `accent` roles; usually a muted text colour and an inverse colour. Name them by what they are (`paper`, `ink`, `clay`), set a `role`, mark decorative ones `"never text"`. Re-render the specimen and record off-limits text pairings (< 4.5:1) in `design-language.md`.

### 6. Design language → `design-language.md`
Draft it from everything gathered, using the template headings. Specific and measurable: margins in px, type case and tracking, colour placement, textures, image treatment, Do/Don't. Set `typeScale` and `spacing` in `tokens.json` to match. Show it for approval.

### 7. Images and reference layouts
`images.json` starts off. Turn generation on only if the brand's videos will use generated photos, following Carousel Studio's image setup: provider, key in `<ws>/.env`, style anchor, then one test image via `node <skill>/scripts/image.mjs`. Reference layouts are a Carousel Studio feature. Mention once that Carousel Studio can use this brand straight away.

## Motion setup (every brand, once)
The skill ships **no style**: no presets, no default curves. How a brand moves, and what its videos show, is worked out with the user here and saved in `brands/<slug>/motion.json` plus the `## Motion` (and, if they use illustrations, `## Illustration`) sections of `design-language.md`. The renderer refuses to run until `motion.json` is complete.

If the brand has no `motion.json`, run `node <skill>/scripts/setup.mjs --motion --brand <slug>`: it writes an empty schema to fill in.

**Start fresh.** Ignore any motion defined before: earlier videos' `meta.json → motion` (including the bundled example), other brands' `motion.json`, a previous `motion.json` for this brand when it's being redone, and anything remembered from earlier sessions. Don't offer them as options or anchors ("same as Bananafarm", "slower than last time"). Describe choices in absolute terms (seconds, px, curve shapes), drawn from this brand's kit and the user's references.

**Transitions are not part of setup.** How ideas hand over (camera moves, morphs, cuts, wipes, hand-offs…) is decided per video, from its content and what the user asks for (`video-logic.md` §2.6). Don't ask about it here or save it.

### 1. Gather (one batch, open questions)
Draft answers from what you already know (the brand's voice, design language, logo, carousels, website) and ask the user to confirm or correct. Ask for **references**: videos, reels, sites or apps whose motion they like (links or files), and anything they dislike. Read or watch descriptions of those references and name what they have in common.
1. **Character:** three words for how the brand should feel in motion, then make them concrete. For example, "settles slowly, never bounces" or "fast in, firm stop".
2. **What the videos show:** type, photos, illustrations, UI or product shots, data. In what mix? Is a headline always present, or can an image carry a moment alone? How many words can sit on screen at once?
3. **Pace:** how long things take to arrive and to move; how far they travel; how long to read.
4. **Curves:** describe them, or give them exactly:
   - a GSAP ease;
   - `logistic(k)` (k ≈ 5 gentle … 15 very steep);
   - `cubic-bezier(x1,y1,x2,y2)` copied from Figma or After Effects.

   The `.in`/`.out` halves for moves split across a cut are derived from the cut curve.

### 2. Write `motion.json`
Translate the answers into tokens. Every field below is required except `visual`, `imageMotion` and `notes`.
```json
{
  "ease": { "enter": "…", "exit": "…", "move": "…", "fade": "…", "ambient": "…", "cutOut": "….in", "cutIn": "….out" },
  "duration": { "enter": 0.6, "exit": 0.5, "move": 1.2, "cut": 0.5, "stagger": 0.08 },
  "distance": 120,
  "readingSpeed": 3.5,
  "imageMotion": { "zoom": 1.06, "pan": 30 },
  "visual": { "wordsPerBeat": 7, "headline": "required | optional", "requires": "photo | illustration | null", "maxVisuals": 2 },
  "notes": "anything that doesn't fit a token"
}
```
- **`ease`:**
  - `enter`/`exit`: things arriving and leaving;
  - `move`: transformations, charts, camera, re-arrangements;
  - `fade`: opacity;
  - `ambient`: the slow layer that keeps the frame alive, usually linear or a soft sine;
  - `cutOut`/`cutIn`: the two halves of a move split across a cut.
- **`readingSpeed`:** keep 3.5 words/s unless the audience reads in a second language (then 3).
- **`visual`:** the brand's rules for what is shown.

### 3. Design language
Write `## Motion` in `design-language.md`: 4-6 specific rules in the brand's own terms:
- the character;
- what keeps moving (the ambient layer);
- how text arrives and leaves;
- what never happens.

If the brand has motifs (a cursor, arrows, selection boxes, stickers…), list each one with what it **means**, not where it goes: "cursor: clicks or drags something that's actually interactive". Videos use a motif only when that meaning applies (`video-logic.md` §3a).

If the brand uses illustrations, also write `## Illustration`, so two illustrations drawn weeks apart match:
- stroke and caps;
- fills vs outlines, and which token colours go where;
- corner radius;
- perspective;
- level of detail;
- what never appears.

Invite 1-3 reference images into `brands/<slug>/illustrations/`. If the brand uses photos, say where they come from: the sources' image library, `brands/<slug>/photos/`, or generation through `images.json` (off by default).

### 4. Motion test (approval)
Make a short composition (about 6s): the hook, a move to a second idea, and the close, built as one timeline per `video-logic.md`. Pick whatever handover suits the test content; it shows the curves and pace and isn't saved as a brand rule.
```
<ws>/brands/<slug>/test/motion/composition.html
<ws>/brands/<slug>/test/motion/meta.json        { "brand": "<slug>", "ratio": "9:16", "duration": 6 }
```
Render it with `node <skill>/scripts/render.mjs <ws>/brands/<slug>/test/motion --brand <slug> --workspace <ws>` and fix every error. Show `storyboard.png` (and `cuts.png` if there's a cut) and give the `video.mp4` path. Ask for approval of the *motion system* (character, curves, pace), not the copy or the handover. Iterate on `motion.json` until approved.

A single video can adjust any token for itself in `meta.json → motion` when the user asks ("slower this time"). Change the brand's `motion.json` only when they want a new default.

## Editing later
Change only the file concerned. Re-render the specimen (fonts, colours) or the motion test (anything that moves) and show the result.
