# Images: the project library and how to use it

Every video folder has an **image library**: `images/library.json` plus a numbered contact sheet `images/library.png`.

**Use images** when the brand's videos show photos (`motion.json → visual.requires: "photo"`), or when the user asks for them ("use the photos from the report", "with images"). Record that in `meta.json → "useImages": true`. Otherwise the library is reference material for the analysis only.

## 1. How the library is built
`ingest.mjs` collects every image it finds:

| Source | Images | Context recorded |
|---|---|---|
| Web pages | up to 24 content images, at the largest size offered (srcset) | alt text, figure caption, nearest heading |
| PDF | embedded photos (JPEG, and 8-bit bitmaps) | the file name |
| Word / PowerPoint / Excel | embedded media | slide number and its first line, or the document title |
| Image files and folders | as they are | the file name |
| Carousels | the carousel's images | the slide that used it |

It then removes exact and near-duplicates (the same picture at another size or quality, keeping the largest), sets aside icons and thumbnails under 300px (`images/_small/`), and measures each image:
- size and orientation;
- `photo` or `graphic` (by detail);
- dominant colour;
- rights: `own` for the user's files, or `third-party` for images from web pages unless `--own` marked the site as theirs.

Images added by hand later: drop them into `images/` and run `node <skill>/scripts/library.mjs <motion-dir>`. Annotations are kept across rebuilds.

## 2. Look and annotate (part of the analysis)
View `images/library.png`, then open the images worth a closer look. For each entry in `library.json` fill in:
- `description`: what it shows, in a line.
- `tags`: subjects, setting, mood, colours.
- `focus`: where the subject is, as a CSS object-position (`"30% 40%"`), so crops keep it.
- `quality`: `good`, `soft`, `busy`, `has text`, `watermarked` or `off-brand`, with a word on why.
- `use`: filled during planning, e.g. `{ "idea": 2, "sequence": "s2", "how": "full-bleed ground, scrim at top" }`, or `"unused"`.

Summarise the useful ones in `meta.json → analysis.assets`.

## 3. Choose (planning)
For each idea that gets an image, pick by:
1. **Relevance:** it shows the idea itself, or the concrete thing behind it (the product, the place, the people, the number's subject). A loosely related image is worse than none.
2. **Resolution for how it's shown:**
   - full-bleed 9:16 needs about 1080 px wide and 1920 tall after cropping;
   - a framed or rounded insert can be much smaller;
   - the renderer warns when a photo is shown above 1.5× its pixels.
3. **Clean areas** where the text will sit, or plan a scrim or panel.
4. **One look across the video:** similar light, colour and style. Mismatched images can be unified with a token-coloured overlay or duotone.
5. **Rights:** third-party images need the user's yes. Ask once, listing the ids, then set `"approved": true` on those entries. The renderer errors on a third-party image without it.
6. **No text in the frame** that competes with the video's own type; avoid watermarks and screenshots of UI unless that's the point.

If no library image fits an idea that needs one, use another treatment the brand allows (type, data, an illustration in its illustration language), or, only if images are enabled or the user agrees, generate one: `node <skill>/scripts/image.mjs --check --brand <slug> [--want on]`, act on its `decision` (paid: never without a yes), then `--prompt "…" --out images/NN.png --size <W>x<H>` for the canvas. Prompts follow the brand's image style, with no text in them.

## 4. Place and treat
- Always `<img data-photo src="../images/…" style="object-fit:cover; object-position:<focus>">`. Size and crop it from the library's `width`, `height` and `focus`.
- How photos are treated (framed, cut-out, full-bleed with a scrim, duotone, as an inset an illustration points to) follows the brand's `design-language.md` → Images.
- **Small or soft images:** never full-bleed. Show them framed and small, as a grid or collage, or blurred/duotoned as a ground.

## 5. Move them (with the brand's motion tokens)
- **Settle:** arrive and settle the way the brand's `ease.enter` and `distance` say.
- **Live during holds:** a slow push or pan, its amount chosen for this video (a few percent of zoom, a few dozen px), always on `ease.fade`/`none`, with text still.
- **Zoom-through:** a photo grows to fill the frame and becomes the next idea's ground. Leave a crossfade if the next ground is another image.
- **Reveal:** a mask or clip-path wipe, or a token panel sliding off.
- **Collage to hero:** several small images sit in a grid, then one scales up to become the hero of the next idea.
