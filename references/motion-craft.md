# Motion craft

These techniques make motion look animated rather than tweened. The brand's `motion.json` still sets the pace and the curves. These techniques set **how properties and elements relate to each other**, so they work in any brand.

Each sequence records the techniques it uses in `plan.techniques`, as `[{ "sequence": "s2", "techniques": ["overshoot-settle", "path-motion"] }]`.

Timings are relative to the brand's durations: `D = window.__motion.duration`, `E = window.__motion.ease`. The helpers are on `window.motionKit` (injected by the renderer).

| id | Rule of thumb | When | Timing | How |
|---|---|---|---|---|
| `property-offset` | Position leads; rotation and scale lag 40-120ms (follow-through) | Anything that travels and turns: cards, stickers, cut-outs | Lag of `D.stagger × 0.7-2` | `motionKit.offsetProps(tl, el, { x, y, rotation, scale }, { at, duration: D.move, ease: E.move, lag: 0.08 })` |
| `overshoot-settle` | Arrivals overshoot 3-8% then settle; exits anticipate with a 2-5% pull-back | Placed objects, landings | Arrival `D.enter`; anticipation `D.exit × 0.3-0.5` before the exit | Use the brand's `ease.enter` if it overshoots; otherwise a 1.03-1.08 scale beat on landing. Anticipate: `tl.to(el, { scale: 0.97 }, t).to(el, { …exit }, t + D.exit * 0.4)` |
| `directional-stagger` | Stagger from the centre, an edge, a corner or across a grid, never only in reading order | Groups: tiles, cards, characters, bars | Total spread `D.stagger × 4-10` | `stagger: { each, from: 'center' \| 'edges' \| 'end' \| [x, y], grid: 'auto' }` |
| `velocity-handoff` | An element leaving fast hands its speed and direction to what arrives | Handovers between ideas, match cuts | The outgoing half on `ease.cutOut`, the incoming half on `ease.cutIn`, same direction and distance | Split one move across the swap; the arriving element starts where the leaving one was heading |
| `seeded-wobble` | Ambient drift driven by seeded noise, not looping sine waves | Stickers, floating cards, idle objects | The whole stretch; amplitude 8-30px, 2-8°; rate 1-2 changes/s | `motionKit.wobble(tl, els, { seed: 7, at, duration, x: 18, y: 14, rotation: 4 })`, with a different seed per group |
| `spring-settle` | Deterministic spring curves for stacks, decks and snaps | Card decks, snapping into a grid, stacks advancing | Duration `D.enter × 1-1.6` | `ease: motionKit.spring({ stiffness: 170, damping: 14 })`. Lower damping = more bounce; keep it in the brand's character |
| `squash-impact` | 2-4% squash on hard landings | Word punch, card drops, a number landing | `D.stagger × 1-2` down, `D.enter × 0.5` back | `tl.to(el, { scaleY: 0.97, scaleX: 1.02, transformOrigin: '50% 100%' }, land).to(el, { scaleX: 1, scaleY: 1, ease: E.enter }, land + 0.05)` |
| `path-motion` | Elements travel on arcs, not straight lines | Throws, orbits, cards flying in | `D.move` | `motionPath: { path: [{ x, y }, …], curviness: 1-1.5 }` or an SVG path |
| `rhythm-variety` | Within any 3s window, mix at least 2 durations and 2 directions | Always | Mix `D.enter`, `D.move` and `D.stagger` multiples | Plan it per sequence; the renderer warns (`monotony`) when a window doesn't |
| `hold-and-hit` | A short stillness before a big move, so the hit lands | The video's peak: a claim, a reveal, the CTA | Pause `D.stagger × 3-6` (the ambient layer keeps going), then the move on `E.enter`/`E.move` | Leave the content layer still for the pause; the ambient layer still runs, so the never-still rule holds |

## Depth helpers
These are described in `composition.md` → Depth.

| Helper | What it does |
|---|---|
| `motionKit.camera(tl, 'push' \| 'pull' \| 'pan' \| 'orbit', { at, duration, ease, amount, x, y, settle })` | Moves the three planes at their parallax rates (far 0.3×, mid 1×, near 1.4×). With `settle: true` the camera starts moved and arrives at rest, so the read text lands exactly where the layout puts it; use it for any move that ends at a read moment |
| `motionKit.focus(tl, 'far' \| 'mid', px, { at, duration, ease })` | Pulls focus: 4-12px blurs a background plane. The near plane (read text) never blurs, and the helper refuses to blur it |

## Rules
- **Seeds, always.** `rng`, `noise` and `wobble` throw without a numeric seed. `Math.random` is a render error.
- **Craft serves the brand.** A calm brand gets small overshoot and slow wobble; a punchy one more. The technique is the same, only the amounts change.
- **Don't stack everything.** Use 2-4 techniques per sequence, chosen for what the sequence does.
