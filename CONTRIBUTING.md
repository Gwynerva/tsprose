# Contributing

## Setup

TSProse is a [Bun](https://bun.sh) workspace. Node.js 20+ is needed too (build scripts and some tools run on Node).

```sh
bun install
bun run check   # build → typecheck → test, everything CI runs
```

## Layout

| Path                      | What                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tsprose`        | Core library (`src/`, runtime tests in `test/runtime`, type tests in `test/types`, registry-augmented type tests in `test/registry`). |
| `packages/transform`      | Whitespace transform, shared tooling helpers (`@tsprose/transform/tooling`), plugins.                                                 |
| `packages/fmt`            | Formatter and its CLI.                                                                                                                |
| `packages/analyzer`       | `tsprose check` CLI, rules, ESLint plugin.                                                                                            |
| `packages/vscode-tsprose` | VS Code extension (private, packaged with `vsce`).                                                                                    |
| `packages/testbed`        | Private proving ground: a site-generator-like kit, corpus build, rendering, benchmarks.                                               |
| `packages/consumer-test`  | Private: compiles a small project against the built `dist` of the core.                                                               |
| `scripts/`                | Repository scripts (cross-platform package build).                                                                                    |

## Guidelines

- TypeScript 7 (beta) is the toolchain; no package uses the TypeScript compiler API at runtime (parsing is `oxc-parser`).
- Core code never throws on bad input: problems become diagnostics with a stable `code`, a position and a path.
- Keep the core universal: integration-specific behaviour (routes, titles, folder conventions) belongs to integrators
  and is expressed through options, hooks, kinds and protocols.
- Add a test for every bug fix; type-level behaviour gets a `*.test-d.ts(x)` test.
- Line endings are LF (`.gitattributes`); prose files may use CRLF and the tools preserve it.
- Record user-facing changes in [CHANGELOG.md](./CHANGELOG.md).
