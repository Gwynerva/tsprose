# Changelog

All notable changes to the TSProse packages. Versions follow [semver](https://semver.org); pre-releases may break
between alphas.

## 2.0.0-alpha.0 — unreleased

A full rewrite as a monorepo. **There is no compatibility with 1.x**: tags, documents, refs, the compiler, the JSON
format and the tooling are all new.

### Packages

- `tsprose` — the core.
- `@tsprose/transform` — TeX-like whitespace rules for JSX (a line break inside inline content is a space; opt-in
  blank-line paragraphs), source positions, bundler/runtime plugins.
- `@tsprose/fmt` — a prose-aware formatter (`tsprose-fmt`), optionally running a code formatter (oxfmt) first.
- `@tsprose/analyzer` — static checks (`tsprose check`) and an ESLint plugin.
- `vscode-tsprose` — editor integration for the formatter.

### Core highlights

- Schema-first tags (`defineBlock`/`defineInline`) with Standard Schema props (or the built-in `s`), DTD-like children
  rules (`pattern`, `counts`, `min`/`max`), `normalize`, `data` with `report`, per-element `state`, `transient` props,
  presets and text templates.
- Tag kits for site generators: common props, typed meta, loose-inline autowrap, element and include hooks.
- Lazy documents with side-effect-free refs modules; documents may own their id.
- `compile`/`createCompileSession`/`compileCorpus`: stable content-based ids, transclusion (`<Include>`), numbering,
  hooks, async derive with content-keyed caching, diagnostics with positions and tree paths.
- Cross-document references: addresses (`ref(id, name?, params?)`), relation kinds, the `ADDRESS` protocol for
  addressable values, `CorpusIndex` (validation, back references, references inside an element, invalidation via
  `affected()`, aliases, virtual documents, JSON persistence) and generated `CorpusRegistry` types.
- Compact JSON (`toJSON`/`fromJSON`) and serve-time derive (`deriveJSON`) sharing derive keys with `compile`.
- Tag manifests (`describeTags`/`collectTags`) for tooling.
- A public entry with an explicit API and `tsprose/internal` for low-level building blocks.

### Migrating from 1.x

There is no automatic migration. In short:

- Replace 1.x schemas and `defineSchema`-style declarations with `defineBlock`/`defineInline`; props are Standard Schema
  values, children rules are declared on the tag.
- Replace unique objects with `defineRefs` handles (or string `$` names, or `ref()` addresses) and documents with
  `defineDocument(() => …, { refs })`.
- Replace `rawToProse`/storage with `compile` (+ `derive`) and `toJSON`/`fromJSON`; site-wide data (link targets)
  moves to `deriveJSON` at serve time.
- Drop `{' '}` workarounds: `@tsprose/transform` handles whitespace.
