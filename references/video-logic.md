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
4. **Read moments.** Mark where each piece of text is fully on screen and settled (`hold`, `hold2`…), and how long it stays still: at least its words ÷ reading speed.
5. **Layers in every stretch** (§3): what the ambient layer is doing, what content motion is running, when text arrives and holds.
6. **Handovers.** For every place where one idea becomes the next, decide the mechanism: a transformation, a camera move, a zoom-through, a hand-off, a cut… There is no preset or brand default. Choose for **this** video:
   - **What the user asked for** comes first ("one continuous camera move", "no cuts", "like this reel").
   - **The content and its relationships:** a number that grows becomes the next chart; a step leads to the next step along a path; a contrast suits a hard cut; a zoom from overview to detail suits a zoom-through.
   - **The throughline:** the element that carries the viewer usually carries the handovers too.
   - **The brand's character and pace** (`motion.json`, `design-language.md` → Motion) set how a handover feels, not which one it is.

   Write each choice and its reason into the sequence's `handover`. Vary them only when the content changes; don't reuse a previous video's choices by habit.
7. **Fixed elements.** Decide what stays on screen for the whole video (handle, series label, mark) and how it adapts to what passes under it.
8. **Elements and their jobs** (§3a). List every motif and visual element the video uses, what it does, and the sequences it appears in. Anything without a job is dropped.

```json
"plan": {
  "throughline": "the camera travels down one long canvas; a blue line draws the path between ideas",
  "ideas": [ { "id": 1, "idea": "", "copy": [""], "facts": [], "visual": "" } ],
  "elements": [ { "what": "cursor", "job": "drags the file into the app; clicks Render", "in": ["s2", "s4"] } ],
  "sequences": [
    { "id": "s1", "from": 0, "to": 4.2, "carries": [1], "moving": "photo pushes in; headline words arrive; line starts drawing", "handover": "line keeps drawing into s2 while the photo slides up out of frame" }
  ],
  "reads": [ { "label": "hold", "at": 1.0, "holds": 1.4, "copy": "" } ],
  "cuts": [ { "label": "cut", "at": 6.1, "why": "", "carry": "" } ],
  "fixed": [ { "what": "", "behaviour": "" } ],
  "seconds": 15
}
```
Show it compactly (throughline, ideas with copy, sequences with times and what's moving, read moments) and continue unless the user objects.

## 3. Layers: always moving, readable when it matters
| Layer | What | Timing |
|---|---|---|
| **Ambient** | slow pushes or pulls on images, drifting or floating shapes, a slowly turning mark, a creeping texture, the camera easing | spans long stretches, often the whole video; `ease.ambient` |
| **Content** | the idea's visual doing its thing: charts growing, counters running, illustrations acting, photos rearranging, lines drawing, cursors travelling | long: it overlaps read moments, and doesn't finish in 0.5s and then sit |
| **Text** | headlines, key lines, labels | arrives, then **holds still** for its reading time; leaves or transforms when the next idea needs the space |

- **Overlap, don't queue.** Stagger starts so motion ripples through the frame. The next idea's motion can begin while the current text is still being read.
- **Text never moves while it's read.** Move the image inside its frame, not the frame carrying a label.
- **Ease with the brand's tokens** (`window.__motion`). No ad-hoc curves or durations.

## 3a. Every element earns its place
A brand's motifs and the visuals in its carousels (cursors, arrows, selection boxes, stickers, sparkles, folders, labels, badges, frames, grids…) are a **vocabulary to draw from, not a checklist to include**. An element appears only where it does what it means in the real world, for the idea on screen at that moment.

**The test, for every element at every appearance:**
1. **What does it mean?** Name the action or meaning it carries in the real world.
2. **Is that true here?** Does the idea on screen right now involve that action or meaning?
3. **Does it act?** Does it do something that changes the frame or makes the point, rather than just sit or drift?

If any answer is no, leave it out of that moment. It isn't decoration, a filler for empty space, or a way to keep the frame moving; the ambient layer does that job.

**How the test applies** (the same reasoning works for any element):

| Element | Belongs when | Not when |
|---|---|---|
| Cursor / pointer | something clickable, draggable or selectable is on screen and the cursor clicks, drags, selects or hovers it | over a headline, a photo or a chart with nothing to interact with; drifting between stops |
| Arrow | there's a direction, a sequence, a cause → effect, or a "look here" for a detail that's easy to miss | pointing at a headline that's already the focus |
| Selection box / handles | something is being chosen, edited, resized or compared | framing text for emphasis on every moment |
| Progress bar, loader, spinner | something is actually in progress (rendering, uploading, growing) | as a generic "tech" texture |
| Notification, badge, tag | there's an event, a status, a count or a label that adds information | repeating the headline's words |
| Sparkle, highlight, underline | one specific word or result deserves the eye | spread over several things at once |
| UI chrome (windows, buttons, folders) | the idea is about the product or a workflow | wrapping content that has nothing to do with software |

**Frequency follows meaning.** An element appears as often as its meaning occurs in the content: maybe once, maybe never. Seeing it in the brand's carousels or design language doesn't oblige the video to use it, and appearing in one sequence doesn't entitle it to the next. When an element has no job in the next idea, it leaves (or transforms into something that does) instead of following the viewer.

**Restraint by default.** One focal element per moment, plus the text. Every motif on screen should be explainable in one sentence ("the cursor drags the .blend file in, because the idea is 'drop your file'"). Write those sentences into `plan.elements`.

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
- Motifs used as decoration or repeated by habit: a cursor everywhere, arrows pointing at the obvious, sparkles on everything (§3a).
- Text that moves while it's read; typewriter sentences; loops or pulses behind text.
- A logo sting at the start.
