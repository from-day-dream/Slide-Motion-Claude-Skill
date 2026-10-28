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

## 9:16: where things go
Platform UI covers the top (status bar, account name), the bottom (caption, audio, progress) and the right edge (like/comment/share buttons). In practice:
- **Text and logo:** x 96 → 940, y 220 → 1500. Centre of the readable area ≈ y 860.
- **Handle / series label:** a meta row at y ≈ 240.
- **Headline block:** starts around y 560-640 so it sits in the upper-middle, where eyes land.
- **Full-bleed backgrounds and images** may fill the whole 1080×1920; only text is restricted.
- The bottom 420px is dead space for text. Use it for background, texture or the lower part of an image.

## Re-laying out a carousel slide
A 4:5 slide is not letterboxed into 9:16. Rebuild it:
- Keep the margins, type styles and colours exactly. Move the meta row down to y 240 and the content block down by ~250px.
- Stack vertically what sat side by side; give the headline more lines rather than a smaller size.
- Image-led slides: let the image run full-bleed top to bottom (crop with `object-fit:cover` and `object-position` to keep the subject out of the text zone).
- **1:1 and 16:9:** less height, so cut copy (drop `support` first) rather than shrinking type. In 16:9 put text in the left 55% and the visual on the right.

## Several ratios
Each ratio is its own motion folder (`…-9x16`, `…-1x1`) with its own scenes, because layouts differ. Reuse the plan and copy from the first (`meta.json`), then re-lay out and render each one.
