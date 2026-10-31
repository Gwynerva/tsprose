# tsprose

The core of TSProse 2.0. See the [repository README](../../README.md) for the big picture.

## Tags

```ts
import { defineBlock, defineInline, s } from 'tsprose';

const Image = defineBlock({
  name: 'image',
  props: { src: s.string(), width: s.optional(s.number()) }, // any Standard Schema value works here (Zod, Valibot, ArkType…)
  children: { of: [Caption], min: 0, max: 1 },               // 'none' | 'inline' | 'block' | 'any' | Tag[] | () => Tag[] | { of, min, max, pattern }
  ref: 'optional',                                            // 'none' | 'optional' | 'required' ($ prop)
  data: ({ props }) => ({ file: props.src.split('/').pop() }),
})
  .key((node) => node.props.src)                              // human readable id base (slugified by compile)
  .derive(async (node, ctx) => probe(node.props.src));        // async data computed by compile, overridable per compile

const H1 = Heading.with({ level: 1 });                        // presets
```

Recursive or mutually recursive tags use the explicit form:

```ts
interface ItemDef extends BlockDef<'item', {}, () => readonly (Tag<ItemDef> | typeof P)[], 'optional'> {}
const Item: Tag<ItemDef> = defineBlock<ItemDef>({ name: 'item', ref: 'optional', children: () => [Item, P] });
```

Tags never throw: invalid props, forbidden children, missing `$` and so on land in `node.diagnostics` with the source
position (`jsxDEV`, or `@tsprose/transform` with `positions: true` where there is no dev runtime), and `compile`
collects them with the path through the tree.

More definition tools:

```ts
const Problem = defineBlock({
  name: 'problem',
  // One schema for the whole props object: exactly one of the prop sets (types forbid mixing them too).
  props: s.exclusive(s.object({ /** Generated */ script: scriptSchema }), s.object({ /** Static */ title: s.string() })),
  // Order-free occurrence limits next to (or instead of) a sequence `pattern`.
  children: { of: [Description, Hint, Answer], counts: { description: 1, answer: [0, 1] }, min: 0 },
  // Rewrite children before validation: generated content, wrapping loose content into a part, reordering.
  normalize: ({ props, children, report }) => ('script' in props && props.script ? props.script.generate() : children),
  // Report problems from data() instead of throwing (errors or warnings, with the element's position).
  data: ({ props, report }) => { if (!('script' in props)) report('problem/static', 'Static problem', 'warning'); return {}; },
});

const m = M.template();          // raw-text tags as tagged templates: {m`\frac{a}{b}`}, {m({ color: true })`x`}
```

`normalize` and `data` share a per-element `state` object; `transient: ['script']` props are validated and passed to
both but not stored on the node (live generator instances). `children: { of: 'inline', whitespace: 'preserve' }` keeps
text verbatim (diagram sources, code).

Nodes stored inside `data` (answer options with content, prepared alternatives) are found by `nodesInData`, derived by
`compile` and serialized as `{ $node }` by `toJSON`/`fromJSON`. `compile` also accepts a plain list of nodes (generated
content in the browser), and `$` accepts a serialized `{ $ref }` handle.

## Kits (for generators)

```ts
const { defineBlock, defineInline, adopt } = createTagKit({
  common: { refable: { toc: s.optional(s.union(s.boolean(), s.string())) } }, // typed common props
  meta: { title: s.optional(s.string()) },                                   // typed meta fields
  wrapLooseInline: P,                                                        // text directly in a block container → <P>
  key: (node) => node.meta.title as string | undefined,                      // default id base
  onElement({ node, props }) { /* derive meta */ },
  onInclude(node) { /* strip meta on transcluded copies */ },
});
```

## Documents, refs, corpus

```ts
// refs.ts — side-effect free, importable from anywhere
export const refs = defineRefs(import.meta.url, { pythagoras: Theorem });
// article.tsx
export default defineDocument(() => <>…<Theorem $={refs.pythagoras} …/>…</>, { refs });
// elsewhere
<Ref to={article.pythagoras}>…</Ref>; <Include of={article.pythagoras} />;

const corpus = new Corpus().add('geometry/article', article).add('geometry/summary', summary);
const { results, backRefs, diagnostics } = await compileCorpus(corpus, { kit, hooks, numbering, slugify, derive });
```

`compile` phases: normalize → validate → ids → index (refs, includes, counters, hooks) → derive (async, concurrent, cached by key) → finalize.

## Cross-document references

TSProse knows documents, addresses and relations; what an id means, how a target is shown and when to rebuild stay
with the integrator.

- **Address**: `{ documentId, name?, params? }`. No `name` = the whole document. `params` is opaque (version, language,
  generator seed, fragment selector…): stored, indexed, passed to resolvers, never interpreted.
- **Two ways to write one reference**: handles (`defineRefs`, imported; best for local links) and addresses by id —
  `ref('dem/1234', 'solution')`, `ref('ref/lagrange')`, `ref('dem/1234', 'statement', { seed: 3 })` — with no import of
  the target, so generated, stored and mutually referencing documents work alike. Both serialize to `{ $ref }`.
- **Relation kinds**: `refSchema(Theorem, { kind: 'uses' })`. Default `link`; `<Include>` is `include`. Kinds are free
  strings; `outgoing[]` records kind, expected tag, params and the ids of enclosing elements (`within`).
- **Stable ids**: `defineDocument(…, { id: 'dem/1234' })` → `corpus.add(doc)`; `corpus.set()`/`remove()` for dev servers.

```ts
const { index, diagnostics } = await compileCorpus(corpus, {
  index: {
    kinds: { generalizes: 'none' },            // include → recompile, others → rederive by default
    dangling: (edge) => (edge.target.documentId.startsWith('ext:') ? 'ignore' : 'error'),
  },
});
index.declare('section/limits', { names: { intro: 'paragraph' } }); // targets without content
index.alias('old/id', 'new/id');                                    // moved documents

index.validate();                        // ref/missing-document, ref/missing-target, ref/type-mismatch
index.incoming('ref/lagrange', { kinds: ['uses'] }); // backlinks
index.outgoing('dem/1234', 'solution-2'); // references inside one element ("uses 3 theorems, 2 problems")
index.affected(['ref/lagrange']);        // Map: dem/1 → 'rederive', dem/2 → 'recompile' (includes propagate)
index.resolve(ref('dem/1234', 'solution')); // { address, document, target: { type, id, path } }
index.toJSON(); CorpusIndex.fromJSON(json);  // persist for a site; updateFromJSON(proseJson) indexes stored prose

// Typed ids for the editor: regenerate on change (from the index, or from declared refs without compiling).
writeFileSync('corpus.d.ts', generateRegistryTypes(index.registryEntries()));
```

`ctx.resolve(ref)` is available in derive functions given `compile({ resolve: index.resolver() })` or
`deriveJSON(json, derive, { resolve })` — serve-time derive is the usual place for values that depend on other documents.

A dev server keeps one index: on change, recompile the changed documents, `index.update()` them, then act on
`index.affected(changed)` — recompile `recompile` entries, drop cached serve-time values of `rederive` entries, and
`index.validate([...ids])` the rest.
`toJSON`/`fromJSON` give a compact, position-free format (`{ t, k, p, d, m, r, id, dk, c }`, text as strings, ref handles as `{ $ref }`).

## Types

- `NodeOf<typeof Tag>` — the structural node type of a tag.
- Augment `Registry` (or use `createProse({ tags })`) to get `ProseNode`, a discriminated union by `type`; renderers can
  then be exhaustive. For large maps annotate (`const renderers: Renderers = {…}`) rather than `satisfies`, which makes
  TypeScript serialize an enormous inferred type.
- Published tag packages should declare hub tags with the explicit interface form to keep `.d.ts` output small.
- JSDoc written on props survives in editors only where the tag's type is read from source. TypeScript's declaration
  emit inlines inferred tag types into `.d.ts` and drops property comments, so a package that wants attribute docs on
  hover should ship its `.ts` sources and point consumers' types at them (or use the explicit interface form, whose
  props are referenced by name).
