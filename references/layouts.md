# Layout archetypes

The skill's layout grammar is a **menu of ten structures**, not a preset. Each archetype describes structure and motion only. The brand supplies every colour, font, curve and duration (`tokens.json`, `motion.json`), and no archetype may bring its own.

## Using them
- **Choose 1-3 per video** in the plan (`plan.archetypes`), and map every sequence to one (`plan.sequences[].archetype`). Two contrasting archetypes (one dense, one sparse) usually beat three.
- **Check the register** (`video-logic.md` §2.0). An expressive-only archetype doesn't go into an explainer video.
- **Check the slots.** Pick an archetype whose slots the content actually fills. A card constellation without 2-5 real images or mini-compositions is the wrong archetype.
- **Adapt to the ratio** (the Ratios line, plus `aspect-ratios.md`) and still fill the canvas (`video-logic.md` §3b).
- **Handovers listed here are candidates.** Each video still chooses its own handover for its content and gives the reason in `plan.sequences[].handover`.
- **See it first:** `node <skill>/scripts/render.mjs --specimen <id> --brand <slug>` renders the archetype's structure template (`templates/archetypes/<id>.html`) with the brand as a 3s clip; `--specimen all` renders every one, with a contact sheet.

Positions are in canvas percentages (x from the left, y from the top) for 9:16 unless noted. "Brand durations" means `window.__motion.duration`.

---

## 1. Card constellation · `card-constellation`
**Register:** both.

**Structure**
- 2-5 rounded cards at slight offsets and rotations (±3-8°, never the same twice) over a textured or patterned ground (the brand's grid, dots or gradient).
- Cards overlap each other by 5-15%. One focus card is 1.2-1.4× the others.
- Spread across the canvas: cards' outer edges reach 5-10% from each side; at least one card crops off an edge.

**Slots:** 2-5 images or mini-compositions (a UI fragment, a stat, a quote); short text on or between cards (read text on the focus card or in a band).

**Motion**
- Enter: cards fly in on staggered arcs (MotionPath) from different edges, with overshoot on landing (`ease.enter`).
- Idle: each card drifts and micro-rotates independently (seeded wobble, different amplitude per card).
- Beat: the constellation rearranges and the focus card swaps.
- Exit: cards are flung off along their own arcs, or collected into a stack.

**Handover candidates:** the focus card scales to full-bleed and becomes the next scene's ground; the cards collapse into a card deck.

**Ratios:** 9:16 stacks the constellation in the middle-to-lower bands, with the type band above; 4:5 and 1:1 spread it diagonally; 16:9 puts it in one half, with type in the other.

**Pitfalls:** equal card sizes; perfect grid alignment; all cards drifting in the same direction; text on a back card.

## 2. Hero cutout orbit · `hero-cutout-orbit`
**Register:** expressive.

**Structure**
- A background-removed subject inside a circle or shape, centred around 45-55% of the height, at 50-65% of the width.
- 3-4 tilted cards orbit at different depths (near: larger, sharp; far: smaller, blurred, behind the subject).
- An oversized title in the top band (spanning the measure); a depth-blurred number or year in the bottom band, bleeding off.

**Slots:** one cutout subject (`cutout.mjs`), 3-4 secondary images, a title (1-3 words), an optional number or year.

**Motion**
- Enter: the subject pops in with scale overshoot; the shape behind it grows from 0.
- Idle: the cards orbit on an ellipse, with parallax by depth and slower far cards; far elements stay blurred.
- The title lands with a per-character stagger (`type.md` → Char stagger).
- Exit: the orbit speeds up and flings the cards out; the subject scales away.

**Handover candidates:** the camera pushes through the circle into the next scene.

**Ratios:** 9:16 and 4:5 as above; 1:1 shrinks the orbit and moves the title to an edge; 16:9 shifts the subject a third in, with the title in the other two thirds.

**Pitfalls:** cutout edges left hard (feather them); all cards on one depth; an orbit too fast to read; a cutout without real alpha.

## 3. Band field · `band-field`
**Register:** expressive.

**Structure**
- 3-6 bold diagonal or chevron bands in brand colours, spanning edge to edge at a **shared** angle (25-45°).
- Each band is 12-25% of the long side thick; together they cover 60-100% of the canvas.
- Chunky stacked display type (2-4 words, one word per line) locked to the band edges: lines sit on bands, not across their seams.

**Slots:** 2-4 words of headline; an optional sub-line in a band.

**Motion**
- Enter: the bands wipe in one after another along their own axis (scaleX from one end).
- Type stacks in line by line with a shadow or extrude offset (`type.md` → Extrude shadow).
- Idle: a slow slide of the band texture or the bands themselves along the band axis.
- Exit: the bands wipe out in the same direction they came in.

**Handover candidates:** the bands sweep across the whole frame and become the next background.

**Ratios:** the angle and the number of bands stay; 16:9 uses flatter angles (15-25°) and longer bands.

**Pitfalls:** bands entering from random directions; type that ignores the band edges; bands in colours the brand marks "never text" carrying text.

## 4. Type wall · `type-wall`
**Register:** expressive.

**Structure**
- One phrase repeated in 6-12 rows filling the whole canvas, bleeding off both sides.
- Rows are decorative (`data-deco`), except one: the read row, inside the safe zone, at full contrast.
- 2-5 shape stickers (`templates/shapes/`) float over the top, if the brand allows them.

**Slots:** one short phrase (2-5 words); 2-5 stickers.

**Motion**
- Enter: rows slide in from alternating sides.
- Idle: rows marquee in alternating directions at slightly different speeds (no two the same); stickers drift and wobble with seeded noise.
- A highlight sweeps one row to the readable state at the hold (colour, weight or a band behind it).
- Exit: rows accelerate off in their direction.

**Handover candidates:** the rows collapse into one line, or the read row scales up to become the next headline.

**Ratios:** 9:16 has 9-12 rows, 4:5 7-9, 1:1 6-8, 16:9 5-6 longer rows.

**Pitfalls:** all rows at the same speed; no row readable at the hold; decorative rows at full contrast competing with the read row.

## 5. Word punch · `word-punch`
**Register:** expressive.

**Structure**
- One word at 60-100% of the canvas width (cropped by the frame if it's decorative; fully inside the safe zone if it's read).
- Minimal or no other elements: a meta band at top and bottom, the ground.

**Slots:** a sequence of 3-8 single words or very short phrases.

**Motion**
- Each word hits with a scale punch (1.15 → 1.0) or a mask slam, holds for its reading time, and is replaced **in place**.
- The ground shifts colour or texture on each hit (brand colours only).
- Timing follows the rhythm of the copy: short words faster, the last word held longest.
- Exit: the last word shrinks or slides into the next layout.

**Handover candidates:** the last word shrinks into a slot in the next layout.

**Ratios:** in 16:9 the word sits on one line at 70-90% of the width; in 9:16 a long word may break into two stacked lines.

**Pitfalls:** words too long to fill the width; uniform timing that ignores the rhythm of the copy; more than ~8 hits (it becomes noise).

## 6. Editorial lockup · `editorial-lockup`
**Register:** both.

**Structure**
- A mixed-face text block (the brand's second face, e.g. a serif italic, plus its heavy display face), with very different sizes per word (contrast of 4× or more).
- A small image or object is cut into the text flow, between words or lines.
- The block spans the measure; bands above and below carry meta and a CTA.

**Slots:** one sentence of 4-10 words with 1-2 emphasis words; one image or object.

**Motion**
- Words land one by one in reading order, each with its own scale and offset.
- The object slides in between lines and gets secondary motion (a slow turn, a bob).
- Idle: the object keeps moving; the emphasis word may shimmer through a fill.
- Exit: the words leave in reverse, except the emphasis word.

**Handover candidates:** the emphasis word stays and becomes the anchor of the next layout.

**Ratios:** 9:16 and 4:5 stack 4-6 lines; 16:9 sets 2-3 long lines.

**Pitfalls:** size contrast below 4×; too many emphasis words; a brand with one face faked with synthetic italics (vary weight and size only).

## 7. Grid mosaic · `grid-mosaic`
**Register:** both.

**Structure**
- A modular grid (2×3 to 4×6) of tiles holding images, brand colours and short labels, filling the canvas edge to edge or margin to margin.
- Gutters from the brand's spacing (`--brand-space-gutter`).
- At least a third of the tiles are colour rests (no image).

**Slots:** 6-24 tiles: a mix of images and colour blocks; 1-4 short labels.

**Motion**
- Enter: tiles fill with a grid stagger from a chosen origin (the centre, a corner, a diagonal), never only in reading order.
- On beats, tiles flip or swap their content.
- One tile expands to full-bleed.
- Idle: images inside the tiles push slowly; one or two tiles change colour.

**Handover candidates:** the expanding tile becomes the next scene.

**Ratios:** 9:16 uses 3×5 or 4×6; 4:5 uses 3×4; 1:1 uses 3×3; 16:9 uses 6×3.

**Pitfalls:** a stagger in reading order only; every tile an image with no colour rest; labels on busy images.

## 8. Card deck · `card-deck`
**Register:** both.

**Structure**
- A perspective stack of 3-6 cards. The front card is upright and readable at 70-85% of the width.
- Back cards step behind with an offset (y and scale) and darken (a brand-colour overlay, not a new colour).
- The deck sits in the hero zone; bands above and below carry the title and a counter.

**Slots:** 3-6 cards, each with an image or a stat and a short line.

**Motion**
- The front card flicks off with rotation and blur, alternating direction from card to card.
- The stack advances with a spring settle.
- Idle: a slow tilt of the whole deck (rotateX/rotateY of a few degrees).
- Exit: the deck flicks or fans out.

**Handover candidates:** the last card flips to reveal the next scene on its back.

**Ratios:** in 16:9 the deck sits in one half, with the text column in the other.

**Pitfalls:** a flat stack with no perspective; every flick in the same direction; text on back cards.

## 9. Type mask window · `type-mask-window`
**Register:** expressive.

**Structure**
- Huge letterforms (one word, 2-6 letters, 80-100% of the width, heaviest weight) act as windows into a photo, texture or gradient.
- The rest of the canvas is solid brand colour.
- A meta band and a small read line sit outside the letters.

**Slots:** one short word; one strong image (or a brand gradient).

**Motion**
- The image pans and scales inside the letters while the letters hold still.
- Then the camera zooms through a counter (the hole in an O, A or D) into the full image.

**Handover candidates:** the zoom-through itself is the handover.

**Ratios:** the word stays one line in every ratio; in 9:16 it can be set vertically (one letter per line) if it's short.

**Pitfalls:** thin fonts (windows too narrow); busy images that make the word unreadable; a word without a counter to zoom through when the zoom is planned.

## 10. Big number stage · `big-number-stage`
**Register:** explainer.

**Structure**
- One sourced number at maximum scale (60-90% of the width), with its unit.
- A short label (up to 6 words) and one supporting visual: a bar, a ring, a dot field or a comparison block.
- The visual fills the band the number doesn't (a bar running edge to edge, a ring bleeding off the bottom).

**Slots:** one number with its source (from `analysis.facts`); a label; an optional comparison value.

**Motion**
- The number counts up with an ease that settles on the final value (`type.md` → Counter roll), in tabular numerals.
- The supporting visual grows in sync.
- A highlight hits the number at landing.
- Idle: the visual breathes or its texture drifts; the number holds.

**Handover candidates:** the bar or ring morphs into a shape in the next layout.

**Ratios:** in 16:9 the number takes the left 60%, and the visual and label the right.

**Pitfalls:** counting jitter on proportional figures (use tabular numerals); numbers not from the sources; the counter still running at the read moment.

---

## Pairing
Natural handovers between archetypes. They're starting points; the video's content decides.

| From → to | How |
|---|---|
| Word punch → Editorial lockup | the last punched word becomes the lockup's emphasis word |
| Word punch → Big number stage | the last word shrinks into the label slot as the number counts |
| Type wall → Word punch | the read row scales up and the other rows clear |
| Type wall → Band field | the rows tilt to the band angle and fatten into bands |
| Band field → any | the bands sweep the frame and become the next ground |
| Card constellation → Card deck | the cards collect into a stack |
| Card constellation → Grid mosaic | the cards square up and snap into the grid |
| Grid mosaic → any | one tile expands to full-bleed |
| Card deck → any | the last card flips; the next scene is on its back |
| Hero cutout orbit → any | the camera pushes through the circle |
| Type mask window → any image-led scene | the zoom through a counter lands on the full image |
| Big number stage → Card constellation | the ring or bar morphs into the focus card |
| Editorial lockup → Hero cutout orbit | the object in the text flow becomes the subject |
