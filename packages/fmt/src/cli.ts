#!/usr/bin/env bun
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Kind } from './format.js';
import { formatAsync, type PipelineOptions, type PreFormat } from './pipeline.js';
import { inlineContainerFromTags, kindOfFromLists, kindOfFromTags, optionsFromDescription, type TagsDescriptionLike } from './kinds.js';

function usage(): never {
  console.error(
    `tsprose-fmt [paths...] [--check] [--stdin [--stdin-filepath f]] [--config tsprose.config.ts] [--width 120] [--no-transform]\n` +
      `  config module: export default { tags } (manifest) and/or { manifest, preFormat, refFirst, inlineTags, blockTags, inlineContainers, blockCalls, separateBlocks, compactContainers, printWidth, indent, transform }`,
  );
  process.exit(2);
}

interface Config extends PipelineOptions {
  readonly tags?: Record<string, { def: { kind: 'block' | 'inline' } }> | undefined;
  readonly inlineTags?: readonly string[] | undefined;
  readonly blockTags?: readonly string[] | undefined;
  readonly inlineComponents?: readonly string[] | undefined;
  /** Block tags whose children are inline-only (`P`, `Td`): blank lines inside them are spaces. */
  readonly inlineContainers?: readonly string[] | undefined;
  /** Code formatter run first (code outside prose, attribute values): `'oxfmt'`, `{ oxfmt: {…} }` or a function. */
  readonly preFormat?: PreFormat | undefined;
  /** A JSON tags description (`describeTags` output) or a path to one, relative to the config file. */
  readonly manifest?: TagsDescriptionLike | string | undefined;
  /** With `separateBlocks: true`: containers that stay compact (no blank lines added), e.g. `['Table', 'Tr', 'List']`. */
  readonly compactContainers?: readonly string[] | undefined;
}

async function loadConfig(path: string | undefined): Promise<PipelineOptions> {
  if (!path) return {};
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { default?: Config } & Config;
  const cfg: Config = mod.default ?? mod;
  let kindOf: ((name: string) => Kind) | undefined;
  let isInlineContainer: ((name: string) => boolean) | undefined;
  let blockCalls = cfg.blockCalls;
  if (cfg.manifest) {
    const description =
      typeof cfg.manifest === 'string'
        ? (JSON.parse(await readFile(resolve(dirname(resolve(path)), cfg.manifest), 'utf8')) as TagsDescriptionLike)
        : cfg.manifest;
    const fromManifest = optionsFromDescription(description);
    kindOf = fromManifest.kindOf;
    isInlineContainer = fromManifest.isInlineContainer;
    blockCalls = [...fromManifest.blockCalls, ...(cfg.blockCalls ?? [])];
  } else if (cfg.tags) {
    kindOf = kindOfFromTags(cfg.tags, cfg.inlineComponents ?? []);
    isInlineContainer = inlineContainerFromTags(cfg.tags);
  } else if (cfg.inlineTags) {
    kindOf = kindOfFromLists(cfg.inlineTags, cfg.blockTags ?? []);
    const inline = new Set([...cfg.inlineTags, ...(cfg.inlineContainers ?? [])]);
    isInlineContainer = (name) => inline.has(name);
  }
  return {
    printWidth: cfg.printWidth,
    indent: cfg.indent,
    transform: cfg.transform,
    kindOf,
    isInlineContainer,
    blockCalls,
    separateBlocks:
      cfg.separateBlocks === true && cfg.compactContainers?.length
        ? ((compact) => (name: string | undefined) => name === undefined || !compact.has(name))(new Set(cfg.compactContainers))
        : cfg.separateBlocks,
    closing: cfg.closing,
    opening: cfg.opening,
    preFormat: cfg.preFormat,
    refFirst: cfg.refFirst,
  };
}

async function* walk(path: string): AsyncGenerator<string> {
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let check = false;
  let stdin = false;
  let stdinPath = 'stdin.tsx';
  let config: string | undefined;
  const overrides: { printWidth?: number; transform?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--check') check = true;
    else if (arg === '--stdin') stdin = true;
    else if (arg === '--stdin-filepath') stdinPath = argv[++i] ?? stdinPath;
    else if (arg === '--config') config = argv[++i];
    else if (arg === '--width') overrides.printWidth = Number(argv[++i]);
    else if (arg === '--no-transform') overrides.transform = false;
    else if (arg.startsWith('--')) usage();
    else paths.push(arg);
  }
  const options: PipelineOptions = { ...(await loadConfig(config)), ...overrides };

  if (stdin) {
    const source = await readStdin();
    const result = await formatAsync(source, stdinPath, options);
    if (result.errors.length) {
      console.error(result.errors.join('\n'));
      return 1;
    }
    process.stdout.write(result.code);
    return 0;
  }

  if (!paths.length) usage();
  let changed = 0;
  let failed = 0;
  let count = 0;
  const started = performance.now();
  for (const root of paths) {
    for await (const file of walk(root)) {
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
      if (check) console.log(`would format ${file}`);
      else await writeFile(file, result.code, 'utf8');
    }
  }
  console.log(`${count} files, ${changed} ${check ? 'need formatting' : 'formatted'}, ${failed} with errors, ${(performance.now() - started).toFixed(0)} ms`);
  return failed || (check && changed) ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
