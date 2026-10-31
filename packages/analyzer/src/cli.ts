#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeSource, applyFixes, formatFinding } from './analyze.js';
import { loadManifest } from './manifest.js';
import type { Located } from './types.js';

function usage(): never {
  console.error(`tsprose check [paths...] --config tsprose.config.ts [--fix] [--json] [--rules children,props,refs,whitespace,braces]`);
  process.exit(2);
}

async function* walk(path: string): AsyncGenerator<string> {
  const { stat } = await import('node:fs/promises');
  const info = await stat(path);
  if (info.isFile()) {
    yield path;
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx|jsx)$/.test(entry.name)) yield full;
  }
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'check') usage();
  const paths: string[] = [];
  let config: string | undefined;
  let fix = false;
  let json = false;
  let rules: string[] | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--config') config = rest[++i];
    else if (arg === '--fix') fix = true;
    else if (arg === '--json') json = true;
    else if (arg === '--rules') rules = rest[++i]?.split(',');
    else if (arg.startsWith('--')) usage();
    else paths.push(arg);
  }
  if (!config) usage();
  const manifest = await loadManifest(config);
  const all: Located[] = [];
  let files = 0;
  for (const root of paths.length ? paths : ['.']) {
    for await (const file of walk(root)) {
      files++;
      const source = await readFile(file, 'utf8');
      const result = analyzeSource(source, file, { manifest, rules: rules as never });
      for (const error of result.errors) console.error(`${file}: parse error: ${error}`);
      if (fix && result.findings.some((f) => f.fix)) {
        await writeFile(file, applyFixes(source, result.findings), 'utf8');
      }
      all.push(...result.findings);
    }
  }
  if (json) console.log(JSON.stringify(all, null, 2));
  else {
    for (const f of all) console.log(formatFinding(f));
    const errors = all.filter((f) => f.severity === 'error').length;
    console.log(`\n${files} files, ${errors} errors, ${all.length - errors} warnings${fix ? ' (fixes applied)' : ''}`);
  }
  return all.some((f) => f.severity === 'error') ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
