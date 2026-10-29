# Video logic

This is the skill's core. It holds no style: what things look like and how they move comes from the user (the brand kit, `motion.json`, `design-language.md`) and from the sources. This file is about **how a video is built**.

## 1. Think in a video, not in frames
A slideshow is frames with transitions between them: a frame animates in, stops, waits, and the next one replaces it. A video is **one continuous piece of time**, where things keep moving, overlap, hand over to each other and change into one another. So:
- **One composition, one master timeline.** The whole video is a single `composition.html` with one GSAP timeline (`composition.md`). There are no scene files and no storyboard to fill in.
- **Sequences, not frames.** The timeline is made of **sequences**: stretches of time that each carry an idea or a movement. A sequence is a function that builds part of the timeline; sequences are placed on the master timeline so they **overlap**. The next one starts while the current one is still moving.
- **Elements live across sequences.** An object introduced in one idea can carry on into the next: it moves, scales, changes colour, morphs, becomes a frame or a background, or travels off-screen and comes back. Only things that have truly finished disappear.
- **Cuts are moments, not boundaries.** A hard cut is a point on the timeline where one set of elements is swapped for another mid-movement. Use it when the brand's motion language calls for it, not as the default way to change ideas.
- **The frame is never still.** Something is always moving; the renderer errors on any stretch over 0.3s where nothing animates. Text is the only thing that pauses, for exactly as long as it needs to be read.

## 2. Plan the video as a whole
After the analysis (`analysis.md`), plan in this order and write it into `meta.json → plan` before any HTML.

0. **Register and archetypes.** Before anything else, choose:
   - **The register** (`plan.register`):
     - **explainer:** every element has a literal job (§3a); 40-65% of the canvas active. For reports, how-tos, data and anything that has to be understood.
     - **expressive:** decoration, repetition and texture are allowed as energy (§3a); 70-100% of the canvas active. For promos, launches and social posts.

     Default from the request; the user's words override ("make it punchy" → expressive, "keep it clean" → explainer).
   - **1-3 layout archetypes** (`plan.archetypes`) from `layouts.md`, chosen for the content and the register. Each sequence then names the archetype it's built on (`plan.sequences[].archetype`). Archetypes are structure and motion only; the brand supplies every colour, font and curve.
1. **Ideas.** Distil the analysis into the few things the video must say: hook first, close last. Each gets its on-screen copy (within the brand's words per read moment) and the facts it uses.
2. **The throughline.** Decide what carries the viewer through the whole video. It might be:
   - an object that keeps transforming;
   - a camera that keeps travelling across a canvas;
   - a number that keeps growing;
   - a set of photos that keeps rearranging;
   - one line drawing the whole piece.

   Ideas then become stops along that line, not separate frames. A throughline must have a real job at every stop (§3a). A motif that would just tag along, like a cursor drifting through stops where there's nothing to click, is not a throughline; use the camera, a line or the content itself instead.
3. **Sequences.** For each stretch of time, write:
   - what is moving;
   - which ideas it carries;
   - its time range on the master timeline;
   - how it overlaps the next sequence.

   Sequences don't map one-to-one onto ideas: one sequence can carry two ideas, and one idea can span two sequences.
4. **Read moments.** Mark where each piece of text is fully on screen and settled (`hold`, `hold2`…), and how long it stays still: at least its words ÷ reading speed. Give each one a **layout** in zones for the ratio that fills the canvas (§3b).
5. **Layers in every stretch** (§3): what the ambient layer is doing, what content motion is running, when text arrives and holds.
6. **Handovers.** For every place where one idea becomes the next, decide the mechanism: a transformation, a camera move, a zoom-through, a hand-off, a cut… There is no preset or brand default. Choose for **this** video:
   - **What the user asked for** comes first ("one continuous camera move", "no cuts", "like this reel").
   - **The content and its relationships:** a number that grows becomes the next chart; a step leads to the next step along a path; a contrast suits a hard cut; a zoom from overview to detail suits a zoom-through.
   - **The throughline:** the element that carries the viewer usually carries the handovers too.
   - **The brand's character and pace** (`motion.json`, `design-language.md` → Motion) set how a handover feels, not which one it is.

   Write each choice and its reason into the sequence's `handover`. Vary them only when the content changes; don't reuse a previous video's choices by habit.
7. **Fixed elements.** Decide what stays on screen for the whole video (handle, series label, mark) and how it adapts to what passes under it.
8. **Elements and their jobs** (§3a). List every motif and visual element the video uses, what it does, the sequences it appears in, and for every interaction what it causes (§3c). Anything without a job, or an interaction without a result, is dropped.

```json
"plan": {
  "register": "expressive",
  "archetypes": ["word-punch", "card-constellation"],
  "typeTreatments": [ { "read": "hold", "treatment": "scale-punch" } ],
  "depth": { "far": ["ground", "repeated type"], "mid": ["cards"], "near": ["read text"] },
  "techniques": [ { "sequence": "s1", "techniques": ["overshoot-settle", "directional-stagger"] } ],
  "throughline": "the camera travels down one long canvas; a blue line draws the path between ideas",
  "ideas": [ { "id": 1, "idea": "", "copy": [""], "facts": [], "visual": "" } ],
  "elements": [ { "what": "cursor", "job": "drags the file into the app; clicks Render", "causes": "the file lands and the app fills with its preview; Render starts the progress bar that carries s4", "in": ["s2", "s4"] } ],
  "sequences": [
    { "id": "s1", "archetype": "word-punch", "from": 0, "to": 4.2, "carries": [1], "moving": "photo pushes in; headline words arrive; line starts drawing", "handover": "line keeps drawing into s2 while the photo slides up out of frame" }
  ],
  "reads": [ { "label": "hold", "at": 1.0, "holds": 1.4, "copy": "", "layout": "top: …; display: …; hero: …; bottom: …" } ],
  "cuts": [ { "label": "cut", "at": 6.1, "why": "", "carry": "" } ],
  "fixed": [ { "what": "", "behaviour": "" } ],
  "seconds": 15
}
```
`typeTreatments` (`type.md`), `depth` (`composition.md` → Depth) and `techniques` (`motion-craft.md`) are filled in as those choices are made.

Show it compactly (register and archetypes, throughline, ideas with copy, sequences with times and what's moving, read moments) and continue unless the user objects.

## 3. Layers: always moving, readable when it matters
| Layer | What | Timing |
|---|---|---|
| **Ambient** | slow pushes or pulls on images, drifting or floating shapes, a slowly turning mark, a creeping texture, the camera easing | spans long stretches, often the whole video; `ease.ambient` |
| **Content** | the idea's visual doing its thing: charts growing, counters running, illustrations acting, photos rearranging, lines drawing, cursors travelling | long: it overlaps read moments, and doesn't finish in 0.5s and then sit |
| **Text** | headlines, key lines, labels | arrives, then **holds still** for its reading time; leaves or transforms when the next idea needs the space |

- **Choreography is your call, per video:** how each element enters and leaves (fades, tucks away, is pushed off by the next, transforms), staggers and reveals. Choose what suits this content and moment, in the brand's curves and pace; follow the user's suggestions when they make them.
- **The ambient layer is your call, per video.** Choose it while composing, from the video's content, the elements already on screen and the brand's character. Examples: a ground that drifts, photos that slowly push in, gradients that shift, a mark that turns, the camera easing. Follow the user's suggestion if they make one. It is never a brand setting and never a setup question. Its amounts (how far an image zooms, how many px it pans) are set per video in the composition, and its elements still pass §3a: an idle cursor with nothing to do isn't ambient motion.
- **Overlap, don't queue.** Stagger starts so motion ripples through the frame. The next idea's motion can begin while the current text is still being read.
- **Text never moves while it's read.** Move the image inside its frame, not the frame carrying a label.
- **Ease with the brand's tokens** (`window.__motion`). No ad-hoc curves or durations.

## 3a. Every element earns its place
A brand's motifs and the visuals in its carousels (cursors, arrows, selection boxes, stickers, sparkles, folders, labels, badges, frames, grids…) are a **vocabulary to draw from, not a checklist to include**. An element appears only where it does what it means in the real world, for the idea on screen at that moment.

**The test, for every element at every appearance:**
1. **What does it mean?** Name the action or meaning it carries in the real world.
2. **Is that true here?** Does the idea on screen right now involve that action or meaning?
3. **Does it act?** Does it do something that changes the frame or makes the point, rather than just sit or drift?
4. **Does the action lead somewhere?** For an interaction, what happens *because* of it (§3c)?

If any answer is no, leave it out of that moment. It isn't decoration, a filler for empty space, or a way to keep the frame moving; the ambient layer does that job.

**How the test applies** (the same reasoning works for any element):

| Element | Belongs when | Not when |
|---|---|---|
| Cursor / pointer | something clickable, draggable or selectable is on screen and the cursor clicks, drags, selects or hovers it | over a headline, a photo or a chart with nothing to interact with; drifting between stops |
| Arrow | there's a direction, a sequence, a cause → effect, or a "look here" for a detail that's easy to miss | pointing at a headline that's already the focus |
| Selection box / handles | something is being chosen, edited, resized or compared, and the chosen thing then changes, moves or is used | framing text for emphasis on every moment; drawn and then dropped with nothing done to what it selected |
| Progress bar, loader, spinner | something is actually in progress (rendering, uploading, growing) | as a generic "tech" texture |
| Notification, badge, tag | there's an event, a status, a count or a label that adds information | repeating the headline's words |
| Sparkle, highlight, underline | one specific word or result deserves the eye | spread over several things at once |
| UI chrome (windows, buttons, folders) | the idea is about the product or a workflow | wrapping content that has nothing to do with software |

**Frequency follows meaning.** An element appears as often as its meaning occurs in the content: maybe once, maybe never. Seeing it in the brand's carousels or design language doesn't oblige the video to use it, and appearing in one sequence doesn't entitle it to the next. When an element has no job in the next idea, it leaves (or transforms into something that does) instead of following the viewer.

**Restraint by default.** One focal element per moment, plus the text. Every motif on screen should be explainable in one sentence ("the cursor drags the .blend file in, because the idea is 'drop your file'"). Write those sentences into `plan.elements`.

**By register.** All of the above is the rule in the **explainer** register. In the **expressive** register, decorative layers are allowed when their job is **rhythm, texture or energy**: repeated type, abstract shapes and stickers (`templates/shapes/`), colour bands, grain. Their job goes into `plan.elements` too (`"job": "energy: wobbling stars keep the type wall alive"`). Two limits still apply:
- **Motifs with a real-world meaning keep it.** A cursor still only appears where something is clicked or dragged, an arrow where there's a direction, a progress bar where something progresses. Decoration is drawn from meaning-free material, never from those motifs.
- **Decoration never competes with the read.** At a read moment the read text stays the most legible thing on screen, and the brand may rule out shapes or textures entirely (`design-language.md`).

## 3b. Fill the canvas
A layout planned for "a slide" ends up as a block in the middle, with empty ground above, below and at the sides. Plan every layout for **this canvas and ratio** instead, so the composition reaches all its edges, whatever the brand.

1. **Zones first.** Before placing anything, split the canvas into zones along its long axis, and give every zone a job at every read moment:
   - **9:16 / 4:5:** horizontal bands, e.g. a top band, display type, the hero, a bottom band.
   - **16:9:** columns, e.g. a full-height image column and a type column.
   - **1:1:** quadrants or a strong diagonal.

   Open space is fine as a deliberate pause *inside* a filled composition (between the type and the hero, around one label). It is never an empty band along an edge.
2. **Scale to the canvas, not to the content.**
   - The hero (display type, a photo or cut-out, a chart, an illustration) is sized from the canvas. Display type is set to span the full measure, even at a size far above the brand's headline level, when the idea is a short phrase. Imagery takes roughly 40-70% of the long side.
   - Let things run past the margins and bleed off an edge: an image cropped by the frame, giant type behind other layers.
   - When something looks small, make it bigger; don't add filler around it.
3. **Layer, don't stack.**
   - Build depth from back to front: full-bleed ground, then large type or shapes, then the image or cut-out, then small pieces of information.
   - Let layers overlap: a cut-out over the display type, a label over the corner of a photo, a rule running under an image.
   - Overlaps must keep text readable (the contrast check still applies). Blocks stacked one under another with gaps between them read as a slide.
4. **Anchor the edges with real content.** Bands at the top and bottom (sides in landscape) carry information that belongs to this video: handle, series, date, a running header or caption, a source line, a price, the CTA, rule lines that frame the poster. Each anchor passes §3a; no stickers or badges just to occupy a corner.
5. **Use the platform zones.** In 9:16 the UI zones (top 220, bottom 420, right 140) are off-limits for text that must be read, not for content. Fill them with the bleed of images and large shapes, the ground's texture, or the parts of display type that aren't needed to read it.
6. **Fill in motion too.** Entrances come from the edges, camera moves and transformations travel across the whole canvas, and between read moments the frame is as full as at the holds.
7. **Use an archetype.** The archetypes in `layouts.md` are worked-out zone plans (a type wall fills every band with repeated rows; a card constellation spreads cards across the canvas). Start from the sequence's archetype, then adapt it to the ratio.
8. **Write it into the plan.** Each read moment gets `layout`: what occupies each zone (`"top: meta row + rule; display: 'MAKE NOISE' across the width; hero: cut-out overlapping the type, bleeding off the bottom; bottom: CTA bar"`).

The renderer warns (`fill`) when nothing but ground sits in more than 15% of the canvas at any edge at a read moment, or when the content spans less than 80% of the width or height. In the expressive register it also warns when less than 70% of the canvas is active.

## 3c. Every motion has a reason; every interaction has a result
Movement is never random. Before animating anything, say why it moves *here and now*, and for an interaction, what it causes.

**Interactions are cause → effect.** A click, drag, selection, hover, tap, type-in or toggle is a cause. It's only worth showing with its effect, and the effect is the point:
- **Click / tap:** a button presses and something responds (a panel opens, a value changes, a render starts, the next idea appears).
- **Drag:** the dragged thing arrives somewhere and that place reacts (it fills, sorts, lights up).
- **Selection:** what's selected is then acted on (it's moved, recoloured, resized, duplicated, compared, deleted, zoomed into, or becomes the next idea's hero).
- **Hover:** it reveals something (a tooltip, a preview, a highlight that matters).
- **Typing:** the typed text is used (a search returns results, a prompt produces an output).

Show the effect on screen, right after the cause and in the same place, before the interacting element leaves. A cursor that comes in, draws a selection and leaves with nothing done to the selection is a cause with no effect: remove the whole interaction, or give it its effect. Never the gesture alone.

**Every other move has one of these reasons**, named in the plan (`plan.sequences[].moving`):
- **carries** the throughline or the viewer's eye to the next idea;
- **reveals** or builds content (a chart grows, a line draws, a word lands);
- **connects** or compares (things regroup, align, line up side by side);
- **emphasises** the one thing that matters in this moment;
- **hands over** to the next idea (§2.6);
- **keeps the frame alive** (the ambient layer, §3; slow, quiet, and never a motif with a meaning).

Direction follows the reason too: things move toward where they're going, along the throughline, or from where they came from; never in a direction picked at random.

If a move or an interaction has no reason you can write in one line, cut it. Stillness plus the ambient layer is better than a meaningless gesture.

## 4. Techniques (a neutral menu; chosen per video, §2.6)
| Technique | What happens | How |
|---|---|---|
| **Transformation** | one element becomes the next idea's element | `morphSVG`, tweening size, radius, colour and position of the same element |
| **Camera move** | the view travels across a larger canvas to the next idea | translate or scale a world layer that holds several ideas; parallax layers at different rates |
| **Zoom-through** | an element grows to fill the frame and becomes the next ground or image | scale the element (origin on the point of interest); swap or crossfade what's inside at full frame |
| **Match cut at peak speed** | a movement is split across a hard cut, so the cut reads as one motion | the first half of a move on `ease.cutOut` (ends at peak speed), swap the elements, the second half on `ease.cutIn`, with the same direction, distance and duration |
| **Wipe with a hidden cut** | a block covers the frame and the swap happens under it | the block covers on `cutOut`, the elements are swapped, the block leaves on `cutIn` |
| **Hand-off** | an element from one idea passes to the next (a line, a number, a photo, a cursor that has something to do next) | keep the element alive and give it a new role and position; only if it has a job in the next idea (§3a) |
| **Draw-on / path travel** | lines, outlines and routes draw themselves; objects travel along them | `drawSVG`, `motionPath` |
| **Re-arrangement** | a set of items (photos, cards, bars) re-orders or regroups to make the next point | tween the positions of the same items |

## 5. Structure and retention
- **Hook first:** the promise is readable within about 1s. No logo intro.
- **One idea per read moment**, holding at least its new words ÷ reading speed (the brand's `readingSpeed`, minimum 1s).
- **The close:** the brand's CTA (from `brand.md`), holding to the end, still with something moving.
- **Length:** 15s by default, or what the user asks for (`meta.json → duration`), checked to ±1s (or 10%).
- **Copy:** at video pace a read moment holds about 5-7 words (the brand's `visual.wordsPerBeat`). Drop supporting lines and cut key lines to a phrase; give an idea another read moment rather than more words.

## 6. Generic motion (avoid, whatever the brand)
- The slideshow pattern: animate in → stop → wait → animate out → next.
- Everything arriving at once; random directions; motion that ignores the throughline.
- A layout clustered in the middle with empty bands at the top, bottom or sides (§3b).
- Motifs used as decoration or repeated by habit: a cursor everywhere, arrows pointing at the obvious, sparkles on everything (§3a).
- Gestures without a result: a cursor that selects, clicks or hovers and leaves with nothing changed; moves with no reason or direction (§3c).
- Text that moves while it's read; typewriter sentences; loops or pulses behind text.
- A logo sting at the start.
