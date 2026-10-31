# vscode-tsprose

A tiny VS Code extension that formats TSProse prose files with `@tsprose/fmt` on save.

- `tsprose.fmt.files` — glob of prose files (default `**/content/**/*.tsx`); other TSX files are left to your default formatter.
- `tsprose.fmt.command` — how to run the formatter (default `bunx tsprose-fmt`).
- `tsprose.fmt.config` — formatter config module (tag kinds, print width).

Workspace settings example:

```jsonc
{
  "[typescriptreact]": { "editor.defaultFormatter": "tsprose.vscode-tsprose", "editor.formatOnSave": true },
  "tsprose.fmt.config": "tsprose.config.ts"
}
```

Build: `bun run build` (esbuild bundle), package: `bun run package` (needs `vsce`).
