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

   Ideas then become stops along that line, not separate frames.
3. **Sequences.** For each stretch of time, write:
   - what is moving;
   - which ideas it carries;
   - its time range on the master timeline;
   - how it overlaps the next sequence.

   Sequences don't map one-to-one onto ideas: one sequence can carry two ideas, and one idea can span two sequences.
4. **Read moments.** Mark where each piece of text is fully on screen and settled (`hold`, `hold2`…), and how long it stays still: at least its words ÷ reading speed.
5. **Layers in every stretch** (§3): what the ambient layer is doing, what content motion is running, when text arrives and holds.
6. **Handovers.** For every place where one idea becomes the next, decide the mechanism: a transformation, a camera move, a zoom-through, or a cut. Use the techniques the brand's `motion.json → techniques.use` favours, and never the ones in `avoid`.
7. **Fixed elements.** Decide what stays on screen for the whole video (handle, series label, mark) and how it adapts to what passes under it.

```json
"plan": {
  "throughline": "the camera travels down one long canvas; a blue line draws the path between ideas",
  "ideas": [ { "id": 1, "idea": "", "copy": [""], "facts": [], "visual": "" } ],
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

## 4. Techniques (neutral; the brand decides which it uses)
| Technique | What happens | How |
|---|---|---|
| **Transformation** | one element becomes the next idea's element | `morphSVG`, tweening size, radius, colour and position of the same element |
| **Camera move** | the view travels across a larger canvas to the next idea | translate or scale a world layer that holds several ideas; parallax layers at different rates |
| **Zoom-through** | an element grows to fill the frame and becomes the next ground or image | scale the element (origin on the point of interest); swap or crossfade what's inside at full frame |
| **Match cut at peak speed** | a movement is split across a hard cut, so the cut reads as one motion | the first half of a move on `ease.cutOut` (ends at peak speed), swap the elements, the second half on `ease.cutIn`, with the same direction, distance and duration |
| **Wipe with a hidden cut** | a block covers the frame and the swap happens under it | the block covers on `cutOut`, the elements are swapped, the block leaves on `cutIn` |
| **Hand-off** | an element from one idea passes to the next (a cursor, a line, a number, a photo) | keep the element alive and give it a new role and position |
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
- Text that moves while it's read; typewriter sentences; loops or pulses behind text.
- A logo sting at the start.
