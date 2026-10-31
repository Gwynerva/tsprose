# @tsprose/transform

JSX drops a line break between a word and an inline tag. Prose cannot live with that, so TSProse adopts the TeX rule:
**a line break is a space**. This package implements it as a tiny source transform that inserts `{" "}` exactly where JSX
would have dropped a meaningful break, so the result stays standard TSX for any bundler and type checking is unaffected.

Rules: between text / elements / expressions separated by a line break a space is inserted, except at the edges of a
container, before closing punctuation (`.,;:!?)]}»”’…`), after opening punctuation, next to an explicit `{""}` glue or an
existing `{' '}`, and (with `isBlock`) between two known block tags. Comments are transparent. Idempotent.

`positions: true` records source positions without the dev JSX runtime (jiti, production builds): every element gets a
hidden `__tsprosePos` attribute that the core runtime turns into `node.pos`, so diagnostics show `file:line:column`.

Optional second TeX rule, `paragraphs: true`: **a blank line is a paragraph break**. The transform inserts `{"\u2029"}`
(the Unicode paragraph separator) at every blank line inside a container, and the core autowrap turns each segment of
loose inline content into its own paragraph — so the body of an article needs no `<P>` at all. Inside an inline tag, or
in a container that does not autowrap, the separator is plain whitespace.

```ts
import tsprose from '@tsprose/transform/vite';            // also /rollup, /esbuild, /webpack
export default { plugins: [tsprose({ isBlock: (name) => blocks.has(name) })] };

import { tsproseBun } from '@tsprose/transform/bun';      // Bun.plugin / bunfig preload
import { withTSProse } from '@tsprose/transform/jiti';    // createJiti(root, { transform: withTSProse(next) })
import { transform } from '@tsprose/transform';            // transform(source, fileName, options) → { code, map, insertions }
```

Files with syntax errors are returned unchanged by every plugin (the compiler reports the error itself).

`bun scripts/report.ts <dir>` reports what the rule would change in an existing content tree without writing anything —
useful when migrating content written for plain JSX (on one real 70-article corpus it found 43 silently glued words).

### `@tsprose/transform/tooling`

Shared helpers for TSProse tools (used by `@tsprose/fmt`, `@tsprose/analyzer` and the editor extension): `parseProse`,
`walkAst`, `jsxName`, `classifyJsxChild` (text, explicit space, glue, paragraph break, comment, expression…), whitespace
and line-ending helpers (`detectEol`, `toLf`, `restoreEol`, `positionOf`), `walkProseFiles` and `loadTsproseConfig` —
the one `tsprose.config.ts` schema all tools read:

```ts
// tsprose.config.ts
export default {
  manifest: './tsprose.manifest.json', // describeTags() output (or `tags: { JSXName: Tag }` + `inlineComponents`)
  printWidth: 120,                      // formatter options: indent, preFormat, separateBlocks, compactContainers, blockCalls…
  mathTags: ['M', 'BlockMath'],         // analyzer: tags whose text is LaTeX
};
```
