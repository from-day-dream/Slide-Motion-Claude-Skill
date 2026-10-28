# Critique rubric (motion)

Run after every render. Look at, in order:
1. `storyboard.png` (every hold beat)
2. `cuts.png`, if the video has cuts (two frames before and after each `cut` label)
3. `poster.png`
4. a few frames from inside each transformation (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 out.png`)
5. `render-report.json`

Skip only in "quick mode", and even then fix every report error.

## Ideas and retention (check first)
1. **Hook in ~1s.** The first read moment (`moments[0].t` in the report) is at about 1s; the promise is clear from `poster.png` alone.
2. **One idea per beat**, in the planned order, ending on the CTA.
3. **Reading time.** Every beat holds its new words ÷ reading speed (`timing.beats`). Cut words before adding seconds.
4. **Length.** Total within ±1s of the target (`target` in the report).
5. **True to the sources.** Every number, name and claim on screen appears in `analysis.facts` (or came from the user), with the same value. Third-party images appear only if the user said yes.

## Brand fidelity
6. **What it shows** follows the brand: `motion.json → visual` and `design-language.md` (and `## Illustration` if it draws). Illustrations, type, photos and data are used the way the brand uses them.
7. **Images, if any:** each one is right for its idea (relevant, sharp at its size, subject kept in the crop); they share one look; type stays legible on them; no `image` warnings or `rights` errors.
8. **Data and illustrations act:** charts grow, counters run, illustrations do something, and they keep moving through the read moments rather than appearing and sitting.
9. **Carousel aesthetic** (carousel sources): the video looks like the same brand moment as the carousel (grounds, emphasis device, photo treatment), but with no slide layout reused as is.
10. **Every element earns its place** (`video-logic.md` §3a). For each motif and visual in each moment, say in one sentence what it does there, and check it against `plan.elements`. A cursor needs something to click or drag; an arrow needs a direction; a selection box needs something being chosen. Remove anything that is decoration, tags along between ideas, or repeats by habit.

## Effects and transitions
11. **A video, not a slideshow.** Does it play as one continuous piece? Look for:
    - a throughline the viewer follows;
    - elements that carry over between ideas;
    - sequences that overlap.

    Or does it go animate → stop → next? Is any cut one that could have been a transformation, a camera move or a hand-off? Re-plan it.
12. **Cuts carry** (`cuts.png`): something continues across each cut: a move at the same direction and speed on both sides, a wipe or zoom-through that fills the frame at the cut, or a shared ground with the ambient motion still running.
13. **Handovers fit this video.** Each one follows from the content, the throughline or what the user asked for, with its reason in `plan.sequences[].handover`. None is a habit carried over from an earlier video.
14. **Brand motion fidelity.** Every curve and duration comes from the brand's tokens (`window.__motion`), and the motion matches `design-language.md` → Motion.
15. **Fixed layer** stays in place across every cut; only its colour changes.
16. **Never still, but readable:** no frozen moments (animate → stop → wait); the ambient and content layers keep moving under every hold, entrances overlap and stagger, and only text pauses for its reading time. No `motion` errors in the report.

## Visual quality (each beat, Carousel Studio's checks)
17. Safe zone, hierarchy, one dominant element, at least a third of the frame clear, brand fonts and tokens, logo on the CTA, no orphans or bad breaks.

## Render report
18. **Zero errors:** budget, visual, overflow, safe-area, contrast, font, timeline, ease, rights, timing, motion and determinism. Warnings: fix unless deliberate, and say why.

## Fix loop
- Edit the composition (or the plan) and re-render; use `--draft` while iterating.
- Finish with a normal render. **Max 2 rounds**, then tell the user what's still imperfect. Record in `meta.json → critique`.
