# @tsprose/analyzer

TypeScript cannot type JSX children per tag (every JSX expression is `JSX.Element`), so the nesting rules of a TSProse
dialect are checked statically here, from the tag definitions themselves.

Rules

- `children` — kind (block in inline, text in block-only containers unless the kit wraps), allowed types, arity, content model (`pattern`).
- `props` — unknown props, props fixed by a preset, missing `$` on `ref: 'required'`, `$` on `ref: 'none'`.
- `refs` — handles from `defineRefs` in the same file must be used exactly once.
- `whitespace` — without the transform: line breaks that drop a space (autofix inserts `{' '}`); with it: redundant `{' '}` hacks.

Surfaces

```bash
tsprose check content/ --config tsprose.config.ts [--fix] [--json]
```

```js
// eslint.config.js
import tsprose from '@tsprose/analyzer/eslint';
import { manifest } from './tsprose.config.ts';
export default [{ files: ['content/**/*.tsx'], plugins: { tsprose }, settings: { tsprose: manifest }, rules: tsprose.configs.recommended.rules }];
```

The manifest is `{ tags: { JSXName: Tag }, wrapsLooseInline?, transform?, inlineComponents? }`; `manifestFromExports(await import('./tags'))`
builds one from a module. Any ESTree-JSX parser works with the ESLint plugin (espree with `ecmaFeatures.jsx`, typescript-eslint for TSX).
Parsing uses oxc; no TypeScript compiler API is required, so it runs on TypeScript 7.
