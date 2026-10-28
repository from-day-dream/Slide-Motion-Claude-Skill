# Aspect ratios

The short side is always **1080px**, so the brand's `typeScale` and `spacing` from Carousel Studio apply unchanged. Presets live in `config/ratios.json`; any other `W:H` works too (short side 1080, long side rounded to an even number).

| Ratio | Canvas | Use | Text safe zone (top / right / bottom / left) |
|---|---|---|---|
| **9:16** (default) | 1080×1920 | Reels, TikTok, Shorts, Stories | 220 / 140 / 420 / 72 |
| 4:5 | 1080×1350 | Instagram / LinkedIn feed | 72 on every edge |
| 1:1 | 1080×1080 | Square feed | 72 on every edge |
| 16:9 | 1920×1080 | YouTube, LinkedIn landscape, websites | 72 / 96 / 96 / 96 |
| custom | short side 1080 | anything else | 72 on every edge |

Length is independent of ratio: **15 seconds by default** for every ratio, or whatever the user asks for (`meta.json` → `duration`), with as many read moments as the copy needs at the brand's reading speed.

Each edge is widened to the brand's `spacing.safeArea` where that is larger. `--no-platform-safe` drops the platform zones and uses only the brand's safe area (e.g. for a website hero video).

## Fill every ratio
Every layout is planned in zones for its canvas and reaches all its edges (`video-logic.md` §3b). The safe zones limit where **text that must be read** goes, not where content goes.

### 9:16 (1080×1920)
Platform UI covers the top (status bar, account name), the bottom (caption, audio, progress) and the right edge (like/comment/share buttons).
- **Readable text and logo:** x 96 → 940, y 220 → 1500.
- **Zones, top to bottom (adapt per idea):**
  1. **Top band, 0-420.** The meta row (handle, series) sits just below the UI at y ≈ 240, often with a rule or a header edge to edge. Above it, the ground, an image bleed or display type running up.
  2. **Display zone.** Type that spans the full width when the idea is a short phrase. It can start right under the top band; it doesn't need to wait for mid-frame.
  3. **Hero zone.** The main visual takes the middle 40-70% of the height and overlaps the display type or bleeds off a side.
  4. **Bottom band, 1500-1920.** Not for readable text, but never empty: the hero continues into it, an image or shape bleeds off the bottom, or a rule, a band of colour or the lower part of display type sits there. A CTA bar or caption can sit just above it (y ≤ 1500).
- **Full-bleed backgrounds and images** may fill the whole 1080×1920.

### 4:5 (1080×1350)
Bands like 9:16 but fewer: a top band with the meta row, display type and hero sharing the middle (overlapping), and a bottom band with the CTA or a caption. Margins are 72px all round, so content reaches much nearer the edges.

### 1:1 (1080×1080)
Quadrants or a diagonal. For example: display type across the top half with the hero cropping in from a corner, or the hero filling one half and type stacked in the other. Meta and CTA anchor opposite corners.

### 16:9 (1920×1080)
Columns. A full-height image or visual column (bleeding top and bottom) beside a type column, or display type running across the full width over the visual. Meta and CTA anchor the top and bottom of the type column. Never a narrow centred block with empty wings.

## Re-laying out a carousel slide
A 4:5 slide is not letterboxed into another ratio. Rebuild it in that ratio's zones:
- Keep the margins, type styles and colours exactly.
- Stack vertically what sat side by side, and give the headline more lines rather than a smaller size. Scale the hero up to its zone; don't move the slide's block down and leave the rest empty.
- Image-led slides: let the image run full-bleed (crop with `object-fit:cover` and `object-position` to keep the subject out of the text zone).
- **1:1 and 16:9:** less height, so cut copy (drop `support` first) rather than shrinking type.

## Several ratios
Each ratio is its own motion folder (`…-9x16`, `…-1x1`) with its own composition, because layouts differ. Reuse the analysis, ideas and copy from the first (`meta.json`), then re-plan the zones and layouts for the new canvas and render it.
