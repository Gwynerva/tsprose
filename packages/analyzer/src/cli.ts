#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';
import {
  loadTsproseConfig,
  missingPaths,
  walkProseFiles,
} from '@tsprose/transform/tooling';
import {
  ALL_RULES,
  analyzeSource,
  fixSource,
  formatFinding,
} from './analyze.js';
import { manifestFromConfig } from './manifest.js';
import type { Located, Manifest, RuleName } from './types.js';

const USAGE =
  `tsprose check [paths...] --config <tsprose.config.ts | tags.json> [--fix] [--json] [--rules ${ALL_RULES.join(',')}]\n` +
  `  exit code: 0 no errors, 1 errors (findings or parse errors), 2 usage or setup errors`;

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): {
  paths: string[];
  config: string;
  fix: boolean;
  json: boolean;
  rules: RuleName[] | undefined;
} {
  const [command, ...rest] = argv;
  if (command !== 'check')
    throw new UsageError(
      command === undefined
        ? 'missing command'
        : `unknown command "${command}"`,
    );
  const paths: string[] = [];
  let config: string | undefined;
  let fix = false;
  let json = false;
  let rules: RuleName[] | undefined;
  const value = (i: number, flag: string): string => {
    const v = rest[i];
    if (v === undefined || v.startsWith('--'))
      throw new UsageError(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--config') config = value(++i, arg);
    else if (arg === '--fix') fix = true;
    else if (arg === '--json') json = true;
    else if (arg === '--rules') {
      const names = value(++i, arg)
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      const unknown = names.filter(
        (r) => !(ALL_RULES as readonly string[]).includes(r),
      );
      if (unknown.length || !names.length)
        throw new UsageError(
          `unknown rule ${unknown.join(', ') || '(none)'}; rules: ${ALL_RULES.join(', ')}`,
        );
      rules = names as RuleName[];
    } else if (arg.startsWith('-'))
      throw new UsageError(`unknown option ${arg}`);
    else paths.push(arg);
  }
  if (!config) throw new UsageError('--config is required');
  return { paths, config, fix, json, rules };
}

/** Run the CLI; resolves to the exit code (0 no errors, 1 errors, 2 usage or setup errors). */
export async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`tsprose: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  let manifest: Manifest;
  try {
    const loaded = await loadTsproseConfig(args.config);
    for (const warning of loaded.warnings) console.error(`warning: ${warning}`);
    manifest = manifestFromConfig(loaded);
  } catch (error) {
    console.error(
      `tsprose: cannot load config ${args.config}: ${(error as Error).message}`,
    );
    return 2;
  }
  const roots = args.paths.length ? args.paths : ['.'];
  const missing = await missingPaths(roots);
  if (missing.length) {
    for (const path of missing)
      console.error(`tsprose: no such file or directory: ${path}`);
    return 2;
  }

  const options = { manifest, rules: args.rules };
  const all: Located[] = [];
  let files = 0;
  let parseErrors = 0;
  let fixed = 0;
  for (const root of roots) {
    for await (const file of walkProseFiles(root)) {
      files++;
      const source = await readFile(file, 'utf8');
      const result = args.fix
        ? fixSource(source, file, options)
        : { ...analyzeSource(source, file, options), code: source };
      for (const error of result.errors)
        console.error(`${file}: parse error: ${error}`);
      if (result.errors.length) parseErrors++;
      if (result.code !== source) {
        await writeFile(file, result.code, 'utf8');
        fixed++;
      }
      all.push(...result.findings);
    }
  }
  const errors = all.filter((f) => f.severity === 'error').length;
  if (args.json) console.log(JSON.stringify(all, null, 2));
  else {
    for (const f of all) console.log(formatFinding(f));
    console.log(
      `\n${files} files, ${errors} errors, ${all.length - errors} warnings` +
        (parseErrors ? `, ${parseErrors} files with parse errors` : '') +
        (args.fix ? ` (${fixed} files fixed)` : ''),
    );
  }
  return errors || parseErrors ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
