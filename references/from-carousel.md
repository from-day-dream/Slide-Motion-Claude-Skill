# From a Carousel Studio carousel

Use when the user says "animate my last carousel", "make a reel of the weekly-review carousel", "turn this carousel into a video".

**The carousel gives the content and the aesthetic, never the layouts.**
- **Content:** copy, images, strategy and caption: raw material that is cut and recombined into the video's core ideas.
- **Aesthetic:** grounds, textures, emphasis device, photo treatment and UI motifs, which the video keeps.
- **Not kept:** the slide-by-slide structure. The video is planned as one continuous composition (`video-logic.md`), in the brand's own motion language, and has nothing to do with the number of slides.

A carousel can also be one source among several: `ingest.mjs carousel:<name|latest> report.pdf https://…` runs the steps below and adds the other sources to the same folder. Either way, `analysis.md` comes next: the carousel's content is analysed with everything else.

## 1. Scaffold
```
node <skill>/scripts/from-carousel.mjs <carousel> [--ratio 9:16] [--duration 15] [--workspace <ws>]
```
`<carousel>` is a folder path, a folder name (or part of one) in `<ws>/output/`, or `latest`. It creates `<ws>/motion/<date>-<slug>-<ratio>/` with:
- `meta.json`: brand, ratio, duration, source, strategy, caption, hashtags and `content` (one entry per slide: headline, emphasis word, key, support, items, image, word count). `plan` is empty.
- `images/`: the carousel's images (photos the video may use, and references).
- `carousel-aesthetic/`: the slide HTML. Read it for the look: grounds, emphasis treatment, photo frames, UI motifs, colour use. Copy CSS for those treatments, not the layouts.
- `caption.txt`: reuse as the video's caption unless the user wants a new one.

It prints the idea budget: how many core ideas the length allows and how many words each may show.

## 2. Analyse, then plan (analysis.md, video-logic.md §2)
0. **Analysis:** read the content, the slides and any other sources; write `meta.json → analysis`.
1. **Core ideas:** distil the content into the allowed number of one-sentence ideas. A rich slide may become two ideas, weak ones merge or go, and the CTA stays last.
2. **Throughline, sequences, read moments and handovers** per `video-logic.md` §2, using what the brand shows and how it moves (`motion.json`, `design-language.md`), drawn in the carousel's aesthetic.
3. Write `meta.json → plan`, show it, then write `composition.html`.

## 3. Several ratios
Run `from-carousel.mjs` once per ratio. Reuse the plan's ideas and sequences; re-compose the composition for the new canvas per `aspect-ratios.md`.
