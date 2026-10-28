# Example: Bananafarm reel (one composition)

A complete Slide Motion project built with the whole-video approach. Everything aesthetic comes from the user, not the skill:
- **Look:** the day-dream-2 brand and its carousel.
- **Motion:** agreed for this reel and stored in `meta.json → motion`, because the brand has no `motion.json` yet.

Sources were gathered with:
```
node scripts/ingest.mjs carousel:bananafarm-cloud-rendering-v3 https://bananafarm.app --own
```
- **Sources** (`source/`, `carousel-aesthetic/`): the Bananafarm carousel and the product's own website.
- **Analysis** (`meta.json → analysis`): the angle, facts with their sources (the $0.096 / $1.66 benchmark and its method), assets and gaps.
- **Image library** (`images/library.png`, `library.json`): 9 images, de-duplicated and annotated, each marked with what it's used for or why not.
- **Plan** (`meta.json → plan`):
  - **Throughline:** the brand's pixel cursor guides the viewer through the whole video.
  - **Sequences:**
    1. hook;
    2. a dive into the monitor;
    3. three steps;
    4. the proof, where the cursor rides the render-farm bar to 17×;
    5. open source;
    6. the close, where the cursor clicks the link.
  - **Read moments:** five.
  - **Cuts:** three match cuts at peak speed, carried across by the cursor.
- **Composition:** `composition.html` has one master timeline. Sequences are functions placed at overlapping times, and the cursor and an ambient layer move from the first frame to the last.
- **Output:** `video.mp4` (15.0s, 1080×1920, no report errors), `poster.png`, `storyboard.png` (read moments), `cuts.png`.

**The brand isn't bundled.** It's day-dream-2, from the user's Carousel Studio workspace, and its body font (Google Sans) can't be redistributed. To re-render, point at a workspace that has that brand:
```
node scripts/render.mjs examples/bananafarm-mixed-snappy --workspace "<carousel-studio workspace>"
```
