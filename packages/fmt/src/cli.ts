#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';
import { missingPaths, walkProseFiles } from '@tsprose/transform/tooling';
import { loadFmtConfig } from './config.js';
import { formatAsync, type PipelineOptions } from './pipeline.js';

const USAGE =
  `tsprose-fmt [paths...] [--check] [--stdin [--stdin-filepath f]] [--config tsprose.config.ts] [--width 120] [--no-transform]\n` +
  `  --check            report files that need formatting, write nothing (exit 1 if any)\n` +
  `  --stdin            format standard input to standard output (--stdin-filepath names it, default stdin.tsx)\n` +
  `  --config <file>    tsprose.config.ts (or a JSON tags description): { manifest | tags + inlineComponents |\n` +
  `                     inlineTags + blockTags + inlineContainers, blockCalls, preFormat, refFirst, separateBlocks,\n` +
  `                     compactContainers, printWidth, indent, transform, closing, opening }\n` +
  `  --width <n>        print width (overrides the config)\n` +
  `  --no-transform     the build has no whitespace transform: emit {' '} where JSX needs it\n` +
  `  --help             this text`;

class UsageError extends Error {}

interface Args {
  readonly paths: string[];
  readonly check: boolean;
  readonly stdin: boolean;
  readonly stdinPath: string;
  readonly config: string | undefined;
  readonly overrides: { printWidth?: number; transform?: boolean };
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const paths: string[] = [];
  let check = false;
  let stdin = false;
  let stdinPath = 'stdin.tsx';
  let config: string | undefined;
  let help = false;
  const overrides: { printWidth?: number; transform?: boolean } = {};
  const value = (i: number, flag: string): string => {
    const v = argv[i];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--check') check = true;
    else if (arg === '--stdin') stdin = true;
    else if (arg === '--stdin-filepath') stdinPath = value(++i, arg);
    else if (arg === '--config') config = value(++i, arg);
    else if (arg === '--width') {
      const width = Number(value(++i, arg));
      if (!Number.isInteger(width) || width <= 0) throw new UsageError(`--width must be a positive integer, got "${argv[i]}"`);
      overrides.printWidth = width;
    } else if (arg === '--no-transform') overrides.transform = false;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
    else paths.push(arg);
  }
  return { paths, check, stdin, stdinPath, config, overrides, help };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Run the CLI; resolves to the exit code (0 ok, 1 formatting needed or errors, 2 usage or setup errors). */
export async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`tsprose-fmt: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!args.stdin && !args.paths.length) {
    console.error(USAGE);
    return 2;
  }

  let options: PipelineOptions = {};
  if (args.config) {
    try {
      const loaded = await loadFmtConfig(args.config);
      for (const warning of loaded.warnings) console.error(`warning: ${warning}`);
      options = loaded.options;
    } catch (error) {
      console.error(`tsprose-fmt: cannot load config ${args.config}: ${(error as Error).message}`);
      return 2;
    }
  }
  options = { ...options, ...args.overrides };

  if (args.stdin) {
    const source = await readStdin();
    const result = await formatAsync(source, args.stdinPath, options);
    if (result.errors.length) {
      console.error(result.errors.join('\n'));
      return 1;
    }
    process.stdout.write(result.code);
    return 0;
  }

  const missing = await missingPaths(args.paths);
  if (missing.length) {
    for (const path of missing) console.error(`tsprose-fmt: no such file or directory: ${path}`);
    return 2;
  }
  let changed = 0;
  let failed = 0;
  let count = 0;
  const started = performance.now();
  for (const root of args.paths) {
    for await (const file of walkProseFiles(root)) {
      count++;
      const source = await readFile(file, 'utf8');
      const result = await formatAsync(source, file, options);
      if (result.errors.length) {
        failed++;
        console.error(`${file}: ${result.errors[0]}`);
        continue;
      }
      if (!result.changed) continue;
      changed++;
      if (args.check) console.log(`would format ${file}`);
      else await writeFile(file, result.code, 'utf8');
    }
  }
  console.log(
    `${count} files, ${changed} ${args.check ? 'need formatting' : 'formatted'}, ${failed} with errors, ${(performance.now() - started).toFixed(0)} ms`,
  );
  return failed || (args.check && changed) ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
