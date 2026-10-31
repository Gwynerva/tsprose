# @tsprose/fmt

A narrow, fast formatter for TSProse prose files. It re-prints JSX regions only; code outside JSX stays byte-for-byte.

- Text is filled to `printWidth` (default 120). A line break is a space (transform rule), so no `{' '}` is emitted and
  existing ones are removed; with `transform: false` it emits `{' '}` at line ends like JSX needs.
- Inline elements never separate from the word they start or end with, nor from following closing punctuation; a line
  breaks only where a space is semantically neutral.
- Inline tags keep attributes on one line; block tags break attributes one per line when too long (re-indented).
- Block children go one per line; single blank lines between blocks are preserved; `<Tag>{expr}</Tag>` hugs.
- A blank line inside loose text of a block container is a paragraph break and is preserved (the transform's
  `paragraphs` rule); inside an inline-only container such as `<P>` it is just a space. The config's `tags` tell which
  tags are inline-only (`children: 'inline'`); with name lists, list them in `inlineContainers`.
- Expressions, comments and attribute values are verbatim (re-indented when multi-line).

```bash
tsprose-fmt content/ --config tsprose.config.ts      # format in place
tsprose-fmt content/ --check                          # CI
tsprose-fmt --stdin --stdin-filepath doc.tsx          # editors
```

**Code outside the prose and attribute values** are left to a regular code formatter run first, through `preFormat`:
`'oxfmt'` (optional dependency, ~40 ms on a 3 400-line article), `{ oxfmt: { singleQuote: true } }`, or any function
(Prettier, Biome, dprint…). The pipeline is transform → code formatter → prose pass: the transform first makes the
source mean the same in standard JSX (`{" "}` for line breaks, `{"\u2029"}` for blank lines), so a formatter that knows
nothing about TSProse cannot glue words or merge paragraphs; the prose pass turns the markers back. `refFirst: true`
prints the `$` attribute first.

The config module exports `{ manifest }` (a JSON tags description from tsprose `describeTags`, or a path to one — the
recommended way: member tags, inline containers and block templates come from the tags themselves), `{ tags }`, or
`{ inlineTags, blockTags, inlineContainers }`, plus `printWidth`, `indent`, `transform`
`separateBlocks` (one blank line between all block items at every depth; `compactContainers` lists exceptions such as
`Table`/`List`) and `blockCalls` (names of functions whose calls produce blocks, e.g. `['mm']` for `{mm\`…\`}`, laid out on their own line).
On the largest Open Math article (3 385 lines) it runs in ~20 ms warm and is idempotent. `bun test/bench.ts [file]` measures it.
