# @tsprose/testbed

A private proving ground shaped like a real educational site generator (an Erudit-style kit and an Open-Math-sized
corpus), so TSProse 2.0 is exercised at the scale and in the form of its real consumers. Not published; integration-specific
names here are deliberate.

- `src/kit.ts`, `src/tags.tsx` — an Erudit-like kit (`toc`/`snippet` common props, `title` meta, paragraph autowrap, title-based ids)
  and ~40 tags: paragraphs, headings (presets), inline/block math with simulated KaTeX `derive`, images/videos with asset probing,
  lists, tables, callouts, details, diagrams, accents (`Statement`/`Term`/`Important` via a factory), the problem family, components.
- `src/hooks.ts` — toc, snippets, counts, duplicate titles (Erudit's rawToProse hooks as `compile` hooks).
- `src/loader.ts`, `src/site.ts` — folder loader (ids from paths), corpus compile, exhaustive HTML renderer (`src/render.tsx`), JSON round trip.
- `content/` — hand-written documents in the 2.0 dialect; `content-broken/` — every author mistake at once.
- `bench/generate.ts --scale N` — synthetic corpora from Open-Math-like fragments; `bench/run.ts <root>` — the benchmark; results in `bench/results.md`.

```bash
bun test                       # vitest: site build, hooks, includes, JSON, HTML, negative documents
bun bench/generate.ts --scale 10
bun bench/run.ts generated/10x
```

Bun applies the whitespace transform through `bunfig.toml` (preload plugin); vitest through `@tsprose/transform/vite`.
