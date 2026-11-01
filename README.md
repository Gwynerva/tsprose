<img src="./.github/assets/banner.svg" alt="TSProse banner">

<p></p>

# TSProse 2.0

**Write prose in TypeScript TSX. Get a typed, linkable, compilable document tree.**

TSProse is a markup language _and_ a programming language at once: Markdown's ease, TeX's power, TypeScript's types.
Tags are schema-first definitions whose types are inferred, documents are lazy and addressable, cross references are
typed handles that a compiler resolves across a whole corpus, and every error comes with a file, a line and a path
through the tree.

```tsx
import {
  defineBlock,
  defineInline,
  defineRefs,
  defineDocument,
  compile,
  s,
} from 'tsprose';

const B = defineInline({ name: 'bold', children: 'inline' });
const P = defineBlock({
  name: 'paragraph',
  children: 'inline',
  ref: 'optional',
});
const Theorem = defineBlock({
  name: 'theorem',
  props: { title: s.string() },
  children: { of: [P], pattern: 'paragraph+' },
  ref: 'required',
  data: ({ props }) => ({ slug: props.title.toLowerCase() }),
});

export const refs = defineRefs(import.meta.url, { pythagoras: Theorem });

export default defineDocument(
  () => (
    <>
      <Theorem $={refs.pythagoras} title="Pythagorean theorem">
        <P>
          In a right triangle, <B>a² + b² = c²</B>.
        </P>
      </Theorem>
    </>
  ),
  { refs },
);

const result = await compile(document, { documentId: 'geometry/pythagoras' });
result.refs.get('pythagoras')!.id; // "pythagoras"
result.diagnostics; // [] — or every problem at once, with positions
```

## Packages

| Package                                       | What it is                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`tsprose`](./packages/tsprose)               | The core: schema-first tags (`defineBlock`/`defineInline`), tag kits for integrators, lazy documents, typed refs and addresses, `compile` (ids, refs, transclusion, hooks, async derived data), a corpus index for cross-document references, compact JSON and serve-time derive.                                                    |
| [`@tsprose/transform`](./packages/transform)  | The TeX rules for JSX: **a line break between inline content is a space**, and (opt-in) **a blank line is a paragraph break**. A tiny source transform with Vite/Rollup/esbuild/webpack/Bun/jiti plugins. No more `{' '}`, no `<P>` around every paragraph. Also hosts the tooling helpers shared by the formatter and the analyzer. |
| [`@tsprose/analyzer`](./packages/analyzer)    | Static checks the type system cannot do (nesting, content models, refs, whitespace): `tsprose check` CLI and an ESLint plugin with autofixes.                                                                                                                                                                                        |
| [`@tsprose/fmt`](./packages/fmt)              | A prose-aware formatter for TSX prose files: fills text by width, never tears an inline element from its punctuation, keeps code outside JSX untouched. ~20 ms on a 3400-line article.                                                                                                                                               |
| [`vscode-tsprose`](./packages/vscode-tsprose) | A minimal VS Code extension that runs `@tsprose/fmt` on save.                                                                                                                                                                                                                                                                        |
| [`@tsprose/testbed`](./packages/testbed)      | Private proving ground shaped like a real educational site: a 40-tag kit, folder loader, corpus build, HTML rendering, synthetic corpora and benchmarks.                                                                                                                                                                             |

## The idea in one paragraph

A **tag** is a value: `defineBlock({ name, props, children, ref, data })`. Its runtime shape (prop validation via any
[Standard Schema](https://standardschema.dev) library or the built-in `s`, a DTD-like content model, ref mode) _is_ its
type. A **kit** (`createTagKit`) lets a site generator add common props, typed meta, paragraph autowrap and hooks to
every tag once — no re-declared types, no `as any`. A **document** is a lazy function; its **refs** live in a side-effect
free module so other documents can link to or transclude (`<Include of={…}/>`) its elements by importing nothing but
handles — or reference anything by id with `ref('guide/intro', 'install')`. `compile` turns a document (or a whole
`Corpus`) into stable ids, resolved links indexed across the corpus (validation, back references, invalidation),
numbering, hook results and async **derived** data, collecting **diagnostics with positions** instead of throwing.
The `Registry` turns the node type into a discriminated union so renderers are exhaustive at compile time.

## Setup

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tsprose",
    "types": ["tsprose/externals"],
  },
}
```

Compile prose with the whitespace rule in the build (Vite shown; Bun, jiti and esbuild adapters exist):

```ts
import tsprose from '@tsprose/transform/vite';
export default { plugins: [tsprose()] };
```

Requires TypeScript 7.1+ (the toolchain is built and tested on `typescript@beta`).

## Development

```bash
bun install
bun run check      # build + typecheck + tests (incl. a consumer project against dist)
bun run test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the layout and guidelines and [CHANGELOG.md](./CHANGELOG.md) for what
changed. The 2.0 monorepo is on the `v2` branch; 1.x lives in the git history and 2.0 has no compatibility layer by
design.

## License

[MIT](./LICENSE)
