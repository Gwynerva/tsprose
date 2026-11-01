# vscode-tsprose

A tiny VS Code extension that formats TSProse prose files with `@tsprose/fmt` on save.

- `tsprose.fmt.files` — glob of prose files, relative to the workspace folder (default `**/content/**/*.tsx`, a common
  layout; set it to match yours); other TSX files are left to your default formatter.
- `tsprose.fmt.command` — how to run the formatter (default `bunx tsprose-fmt`).
- `tsprose.fmt.config` — the `tsprose.config.ts` module, relative to the workspace folder (or to the file's folder when
  the file is outside any workspace).

Workspace settings example:

```jsonc
{
  "[typescriptreact]": {
    "editor.defaultFormatter": "tsprose.vscode-tsprose",
    "editor.formatOnSave": true,
  },
  "tsprose.fmt.config": "tsprose.config.ts",
}
```

Build: `bun run build` (esbuild bundle), package: `bun run package` (`@vscode/vsce`). Output and errors are shown in the
"TSProse" output channel.
