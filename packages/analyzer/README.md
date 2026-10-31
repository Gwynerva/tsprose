# @tsprose/analyzer

TypeScript cannot type JSX children per tag (every JSX expression is `JSX.Element`), so the nesting rules of a TSProse
dialect are checked statically here, from the tag definitions themselves.

Rules

- `children` — kind (block in inline, text in block-only containers unless the kit wraps), allowed types, arity, content model (`pattern`).
- `props` — unknown props, props fixed by a preset, missing `$` on `ref: 'required'`, `$` on `ref: 'none'`.
- `refs` — handles from `defineRefs` in the same file must be used exactly once.
- `whitespace` — without the transform: line breaks that drop a space (autofix inserts `{' '}`); with it: redundant `{' '}` hacks.
- `braces` — LaTeX in JSX text glued to a `{…}` expression (`<M>\sqrt{20}</M>` renders `\sqrt20`): write math in a template instead.

Surfaces

```bash
tsprose check content/ --config tsprose.config.ts [--fix] [--json] [--rules children,props]
```

Exit codes: `0` no errors, `1` errors found (including files that do not parse), `2` usage errors, missing paths or a
broken config. `--fix` applies autofixes until nothing is left to fix and reports what remains; files with syntax errors
are never fixed. The config is the shared `tsprose.config.ts` (see `@tsprose/transform/tooling`): with `manifest`,
`wrapsLooseInline` and `transform` default to `true`; `mathTags` limits the `braces` rule to LaTeX tags. The CLI runs on Bun.

```js
// eslint.config.js
import tsprose from '@tsprose/analyzer/eslint';
import { manifest } from './tsprose.config.ts';
export default [{ files: ['content/**/*.tsx'], plugins: { tsprose }, settings: { tsprose: manifest }, rules: tsprose.configs.recommended.rules }];
```

The manifest is `{ tags: { JSXName: Tag }, wrapsLooseInline?, transform?, inlineComponents? }`; `manifestFromExports(await import('./tags'))`
builds one from a module. Any ESTree-JSX parser works with the ESLint plugin (espree with `ecmaFeatures.jsx`, typescript-eslint for TSX).
Parsing uses oxc; no TypeScript compiler API is required, so it runs on TypeScript 7.
