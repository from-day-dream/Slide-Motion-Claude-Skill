# Type as graphics

In motion graphics, type is often the main graphic element, not a caption. These rules and treatments are brand-neutral: the faces, weights, colours and curves still come only from the brand.

Use **GSAP SplitText** (loaded and registered by the renderer) for all per-line, per-word and per-character work:

```js
const split = SplitText.create('.title', { type: 'lines,words,chars', mask: 'lines' });
tl.from(split.chars, { yPercent: 110, duration: D.enter, ease: E.enter, stagger: D.stagger / 2 }, t);
```

`splitWords(selector)` still works for simple word staggers.

## Layout rules
- **Scale contrast:**
  - In expressive frames, the largest text is 8-10× the smallest. In explainer frames it's at least 4×.
  - The renderer warns (`scale-contrast`) when an expressive video has no read moment at 6× or more.
  - Size display type from the canvas (`fitText(selector, widthPx, maxPx)`), not from the brand's headline level.
- **Mixed-face lockups:** pair the brand's display face with its second face (`--brand-font-accent`, e.g. a serif italic with a heavy sans) when the brand has two. With one face, vary weight and size only, and never fake an italic.
- **Decorative type may bleed; read text never does:**
  - Repeated rows, giant background words, mask letters and tickers are decorative. Mark them `data-deco` (no `data-text`) and let them run off the canvas and into the platform zones.
  - Read text stays inside the safe zone and is never blurred (`composition.md` → Depth).
- **Tight leading:** 0.85-0.95 for stacked display type. Give the block some bottom padding so the descenders of the last line don't count as overflow.
- **Numbers that count** use tabular numerals (`font-variant-numeric: tabular-nums`), so the width doesn't jitter.
- **The read text is the most legible thing at the hold**, however busy the decoration around it is.

## Treatments
Record each read moment's treatment in `plan.typeTreatments` as `[{ "read": "hold2", "treatment": "line-mask" }]`. Timings are relative to the brand's durations (`D = window.__motion.duration`); `E` means `window.__motion.ease`.

| id | What it does | Best with | Timing |
|---|---|---|---|
| `line-mask` | Lines rise from behind a clip mask | Editorial lockup, headlines | `SplitText` with `type: 'lines', mask: 'lines'`; `yPercent: 100 → 0`; `D.enter` per line; stagger `D.stagger × 2-3`; `E.enter` |
| `char-stagger` | Characters land with offset, rotation and overshoot | Hero titles, word punch | `type: 'chars'`; `y: 0.4-0.8em`, rotation 5-15°; `D.enter × 0.8`; stagger `D.stagger × 0.3-0.6`; overshooting `E.enter`. Stagger from the centre or edges for variety |
| `word-swap` | One word is replaced in place while the rest holds | Editorial lockup, taglines | The old word exits on `E.exit` over `D.exit`; the new one enters `D.stagger × 2` later. Keep the slot's width (`min-width`) so the line doesn't jump |
| `scale-punch` | The word hits at 1.15× and settles to 1.0 | Word punch, number landings | `scale: 1.15 → 1`, `D.enter × 0.6-0.8`, `E.enter`; a hold-and-hit pause of `D.stagger × 3-5` before it (`motion-craft.md`) |
| `marquee-row` | Repeated text scrolls at a set speed | Type wall, rails, tickers | Linear (`E.ambient`), over the whole stretch; alternate directions; vary speeds by 10-30% between rows; decorative only |
| `counter-roll` | Digits roll vertically to the final value | Big number stage | Each digit is a column of 0-9 inside a mask; `yPercent` to the digit; columns stagger right to left by `D.stagger`; `E.move`, total `D.move × 1-1.5` |
| `image-in-type` | A photo or gradient is clipped to the letterforms | Type mask window | `background-clip: text` on heavy type at 300px+; pan and scale the background over the whole stretch on `E.ambient` |
| `blend-over-photo` | Text with `mix-blend-mode` over imagery | Card constellation, photo heroes | Decorative layers only (`difference`, `multiply`); the read text stays unblended, or the contrast check can't vouch for it |
| `stroke-draw` | Outline text is drawn, then filled | Expressive titles | SVG `<text>` with a stroke: DrawSVG `0% → 100%` over `D.move`, then fill-opacity `0 → 1` over `D.enter` |
| `extrude-shadow` | Stacked offset copies give a 3D block look | Band field | Layered `box-shadow`/`text-shadow` in brand colours; grow the offsets from 0 as the line lands (`D.enter`, `E.enter`) |

**Choosing:**
- Use one main treatment per read moment, plus at most one supporting one.
- Vary treatments across the video, but keep each one tied to what the copy does: a swap for a change, a punch for a claim, a roll for a number.
- A treatment never runs during the reading time: it finishes before the `hold` label, and the text then stays still.
