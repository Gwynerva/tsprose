# tsprose

Write prose in TypeScript TSX and compile it into a typed, linkable document tree: schema-first tags, lazy documents,
typed cross references across a whole corpus, transclusion, async derived data and diagnostics with positions.

This is the core package of TSProse 2.0. See the [repository README](../../README.md) for the other packages
(whitespace transform, formatter, analyzer, editor extension).

> **Status:** `2.0.0-alpha`. A full rewrite with no 1.x compatibility; the API may still change before 2.0.0.

## Contents

- [Install and set up](#install-and-set-up)
- [Tags](#tags)
- [Kits (for generators)](#kits-for-generators)
- [Documents and refs](#documents-and-refs)
- [Compiling](#compiling)
- [Cross-document references](#cross-document-references)
- [JSON and serve-time derive](#json-and-serve-time-derive)
- [Manifests (for tooling)](#manifests-for-tooling)
- [Types](#types)
- [Diagnostics](#diagnostics)
- [`tsprose/internal`](#tsproseinternal)

## Install and set up

```sh
npm install tsprose        # or: bun add tsprose / pnpm add tsprose
```

Requirements: Node.js 20+ (or Bun), TypeScript 5.5+ (TypeScript 7 works), ESM.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tsprose",
    "types": ["tsprose/externals"], // optional ambient helpers
  },
}
```

In development the JSX dev runtime records source positions for diagnostics. Where there is none (jiti, production
builds), `@tsprose/transform` with `positions: true` injects them; it also implements the TeX-like whitespace rules
(a line break inside inline content is a space, a blank line can be a paragraph break).

## Tags

```ts
import { defineBlock, defineInline, s } from 'tsprose';

const Image = defineBlock({
  name: 'image',
  props: { src: s.string(), width: s.optional(s.number()) }, // any Standard Schema value works (Zod, Valibot, ArkType…)
  children: { of: [Caption], min: 0, max: 1 }, // 'none' | 'inline' | 'block' | 'any' | Tag[] | () => Tag[] | { of, min, max, pattern, counts }
  ref: 'optional', // 'none' | 'optional' | 'required' ($ prop)
  data: ({ props }) => ({ file: props.src.split('/').pop() }),
})
  .key((node) => node.props.src) // human readable id base (slugified by compile)
  .derive(async (node, ctx) => probe(node.props.src)); // async data computed by compile, overridable per compile

const H1 = Heading.with({ level: 1 }); // presets
```

Recursive or mutually recursive tags use the explicit form:

```ts
interface ItemDef extends BlockDef<
  'item',
  {},
  () => readonly (Tag<ItemDef> | typeof P)[],
  'optional'
> {}
const Item: Tag<ItemDef> = defineBlock<ItemDef>({
  name: 'item',
  ref: 'optional',
  children: () => [Item, P],
});
```

Tags never throw: invalid props, forbidden children, a missing `$` and so on land in `node.diagnostics` with the source
position, and `compile` collects them with the path through the tree.

More definition tools:

```ts
const Exercise = defineBlock({
  name: 'exercise',
  // One schema for the whole props object: exactly one of the prop sets (types forbid mixing them too).
  props: s.exclusive(
    s.object({ /** Generated */ generator: generatorSchema }),
    s.object({ /** Static */ title: s.string() }),
  ),
  // Order-free occurrence limits next to (or instead of) a sequence `pattern`.
  children: {
    of: [Statement, Hint, Answer],
    counts: { statement: 1, answer: [0, 1] },
    min: 0,
  },
  // Rewrite children before validation: generated content, wrapping loose content, reordering.
  normalize: ({ props, children }) =>
    'generator' in props && props.generator
      ? props.generator.render()
      : children,
  // Report problems from data() instead of throwing (errors or warnings, with the element's position).
  data: ({ props, report }) => {
    if (!('generator' in props))
      report('exercise/static', 'Static exercise', 'warning');
    return {};
  },
  transient: ['generator'], // validated and passed to normalize/data, but not stored on the node
});

const m = M.template(); // raw-text tags as tagged templates: {m`\frac{a}{b}`}, {m({ color: true })`x`}
```

`normalize` and `data` share a per-element `state` object. `children: { of: 'inline', whitespace: 'preserve' }` keeps
text verbatim (diagram sources, code). Nodes stored inside `data` are found by `nodesInData`, derived by `compile` and
serialized as `{ $node }`.

## Kits (for generators)

A kit adds common props, typed meta, paragraph autowrap and hooks to every tag of a site, once:

```ts
const { defineBlock, defineInline, adopt } = createTagKit({
  common: { refable: { toc: s.optional(s.union(s.boolean(), s.string())) } }, // typed common props
  meta: { title: s.optional(s.string()) }, // typed meta fields
  wrapLooseInline: P, // loose text in a block container → <P>
  key: (node) => node.meta.title as string | undefined, // default id base
  onElement({ node, props }) {
    /* derive meta */
  },
  onInclude(node) {
    /* adjust transcluded copies */
  },
});
```

## Documents and refs

```ts
// refs.ts — side-effect free, importable from anywhere
export const refs = defineRefs(import.meta.url, { pythagoras: Theorem });

// article.tsx — the content function runs only when compiled, so importing documents is free and cannot cycle
export default defineDocument(() => <>…<Theorem $={refs.pythagoras} title="…">…</Theorem>…</>, { refs });

// elsewhere
<Link to={refs.pythagoras}>the theorem</Link>;
<Include of={refs.pythagoras} />; // a compiled copy of the element
```

A document may own its id: `defineDocument(…, { id: 'theorems/pythagoras' })`. Elements are addressable by their `$`
name (a handle from `defineRefs` or a plain string).

## Compiling

```ts
const result = await compile(document, {
  documentId: 'geometry/pythagoras',
  kit,
  hooks,
  numbering,
  derive,
});
result.refs.get('pythagoras')!.id; // "pythagoras"
result.diagnostics; // every problem at once, with positions and tree paths

const corpus = new Corpus()
  .add('geometry/article', article)
  .add(summary /* own id */);
const { results, index, diagnostics } = await compileCorpus(corpus, {
  kit,
  hooks,
});
```

Phases: evaluate and normalize the root → resolve `<Include>`s → collect node diagnostics → ids and content hashes →
refs and outgoing references → numbering and hooks → derive (async, concurrent, cached by content). Nothing throws
unless `strict: true`.

- **Ids**: a `$` name wins; otherwise the tag's `key()`, otherwise `type-<content hash>`. Ids do not depend on positions.
- **Hooks** (`defineHook({ name, enter, leave, finish })`) walk the compiled tree once and return a result
  (`result.hooks.get(name)`), e.g. a table of contents.
- **Derive** functions run after everything else; their values are keyed by the node's content (`deriveKey`), so a
  `derivedCache` from a previous build skips unchanged nodes.
- **Sessions** (`createCompileSession(options)`) share results across calls: a document transcluded by many others is
  compiled once. Dev servers create one per build.

## Cross-document references

TSProse knows documents, addresses and relations; what an id means, how a target is shown and when to rebuild stay
with the integrator.

- **Address**: `{ documentId, name?, params? }`. No `name` = the whole document. `params` is opaque (version, language,
  generator seed, fragment selector…): stored, indexed and passed to resolvers, never interpreted.
- **Three ways to write a reference**, all serialized as `{ $ref }`:
  - a **handle** from `defineRefs` (imported; best for local links);
  - an **address by id**: `ref('guide/intro', 'install')`, `ref('theorems/pythagoras')`,
    `ref('exercises/12', 'statement', { seed: 3 })` — no import of the target, so generated, stored and mutually
    referencing documents work alike;
  - any **addressable** value implementing `[ADDRESS]()` (a path proxy like `site.guide.intro`, a record, a route).
- **Relation kinds**: `refSchema(Theorem, { kind: 'uses' })`. Default `link`; `<Include>` is `include`. Kinds are free
  strings; outgoing references record the kind, the expected tag, params and the enclosing elements (`within`).
- **Typed ids**: augment `CorpusRegistry` (generated with `generateRegistryTypes`) and `ref()` checks document ids and
  element names, and knows each element's tag.

```ts
const { index } = await compileCorpus(corpus, {
  index: {
    kinds: { generalizes: 'none' }, // include → recompile, others → rederive by default
    dangling: (edge) =>
      edge.target.documentId.startsWith('ext:') ? 'ignore' : 'error',
  },
});
index.declare('section/limits', { names: { intro: 'paragraph' } }); // targets without content
index.alias('old/id', 'new/id'); // moved documents

index.validate(); // ref/missing-document, ref/missing-target, ref/type-mismatch
index.incoming('theorems/pythagoras', { kinds: ['uses'] }); // back references
index.outgoing('guide/intro', 'install'); // references inside one element
index.affected(['theorems/pythagoras']); // Map: id → 'recompile' | 'rederive' | 'revalidate'
index.resolve(ref('guide/intro', 'install')); // { address, document, target: { type, id, path } }
index.toJSON();
CorpusIndex.fromJSON(json); // persist; updateFromJSON(proseJson) indexes stored prose

writeFileSync('corpus.d.ts', generateRegistryTypes(index.registryEntries())); // or registryEntriesFromCorpus(corpus)
```

A dev server keeps one index: on change, recompile the changed documents, `index.update()` them, then act on
`index.affected(changed)` — recompile `recompile` entries, drop serve-time values of `rederive` entries, and
`index.validate(ids)` the rest.

## JSON and serve-time derive

`toJSON`/`fromJSON` give a compact, position-free format: `{ t, k, p, d, m, r, id, dk, c }` per node, text as
strings, references as `{ $ref }`, nested nodes as `{ $node }`.

Values that depend on the whole corpus (link titles, back references) belong to serve time:

```ts
const served = await deriveJSON(
  json,
  { link: (node, ctx) => describe(ctx.resolve?.(node.props.to)) },
  {
    resolve: index.resolver(),
    cache, // per build; failures are not cached
    onError: log,
  },
);
```

`deriveJSON` uses the same derive keys as `compile`, so caches can be shared.

## Manifests (for tooling)

`describeTags(tags)` / `collectTags(module)` produce a JSON manifest (names, kinds, props, children rules) that the
formatter and the analyzer read, so tooling never has to execute prose.

## Types

- `NodeOf<typeof Tag>` — the structural node type of a tag.
- Augment `Registry` (or use `createProse({ tags })`) to get `ProseNode`, a discriminated union by `type`; renderers can
  then be exhaustive. For large maps annotate (`const renderers: Renderers = {…}`) rather than `satisfies`, which makes
  TypeScript serialize an enormous inferred type.
- Published tag packages should declare hub tags with the explicit interface form to keep `.d.ts` output small.
- JSDoc on props survives in editors only where the tag's type is read from source: declaration emit inlines inferred
  tag types and drops property comments. Ship `.ts` sources (or use the explicit interface form) for docs on hover.

## Diagnostics

Every diagnostic has `severity`, a stable `code`, a `message`, the source `pos` and the tree `path`.

| Area          | Codes                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| props         | `props/invalid`                                                                                                                                 |
| children      | `children/forbidden`, `children/kind`, `children/type`, `children/count`, `children/arity`, `children/pattern`, `children/invalid`              |
| refs          | `ref/invalid`, `ref/forbidden`, `ref/required`, `ref/mismatch`, `ref/foreign`, `ref/duplicate`, `ref/collision`, `ref/unused`, `ref/unresolved` |
| corpus        | `ref/missing-document`, `ref/missing-target`, `ref/type-mismatch` (from `index.validate()`)                                                     |
| include       | `include/self`, `include/whole-document`, `include/unresolved`, `include/cycle`, `include/failed`, `include/missing`                            |
| document      | `document/threw`, `document/loose-inline`                                                                                                       |
| json          | `json/unknown-type` (`fromJSON` with a prose instance)                                                                                          |
| tag callbacks | `tag/key`, `tag/data`, `tag/normalize`, `tag/hook`, `tag/component`, `hook/failed`, `derive/failed`                                             |

`formatDiagnostics(diagnostics)` prints them as `file:line:column`, `throw new TSProseError(…)` carries them.

## `tsprose/internal`

Low-level building blocks for integrations and sibling packages — children building, node internals (`getDef`,
`attachDef`), schema reference metadata, content hashes, `forEachReference`. Less stable than the main entry.

## License

MIT © Gwynerva
