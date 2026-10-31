import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSync, type ParseResult } from 'oxc-parser';

/**
 * Shared building blocks for TSProse tools (the transform, `@tsprose/fmt`, `@tsprose/analyzer`, editor
 * integrations): parsing, AST walking, JSX child classification, whitespace and line-ending helpers,
 * file discovery and the `tsprose.config.ts` loader. No dependency on the `tsprose` runtime.
 */

//
// Constants
//

/** Unicode paragraph separator: `{" "}` in JSX children is an explicit paragraph break. */
export const PARAGRAPH_SEPARATOR = ' ';
/** Closing punctuation: a line break before it is not a space. */
export const DEFAULT_CLOSING = '.,;:!?)]}»”’…';
/** Opening punctuation: a line break after it is not a space. */
export const DEFAULT_OPENING = '([{«“‘';
/**
 * A blank line: two or more newlines with only spaces/tabs between them. One newline is `\r\n`, `\n` or a lone
 * `\r` (never the `\r` of a `\r\n` pair: CRLF must not look like a blank line). Global, with one capturing group,
 * so it works with `exec` loops and with `split` (separators land at odd indexes).
 */
export const BLANK_RUN = /((?:\r\n|\r(?!\n)|\n)[ \t\f]*(?:(?:\r\n|\r(?!\n)|\n)[ \t\f]*)+)/g;

//
// Parsing and walking
//

/** An oxc / ESTree node. oxc nodes carry `start`/`end`; ESLint nodes carry `range`. */
export interface AstNode {
  type: string;
  start?: number;
  end?: number;
  range?: [number, number];
  [key: string]: unknown;
}

/** An oxc node: offsets always present. */
export interface OxcNode extends AstNode {
  start: number;
  end: number;
}

/**
 * oxc `lang` for a file name: `.ts`/`.mts`/`.cts` → `ts` (no JSX; `<T>x` is a cast), `.jsx`/`.js`/`.mjs`/`.cjs`
 * → `jsx`, anything else → `tsx`. A `?query` suffix (bundler ids) is ignored.
 */
export function langOf(fileName: string): 'ts' | 'tsx' | 'jsx' {
  const clean = fileName.split('?')[0]!;
  if (/\.[mc]?ts$/.test(clean)) return 'ts';
  if (/\.(jsx|[mc]?js)$/.test(clean)) return 'jsx';
  return 'tsx';
}

/** Parse a prose file (an ES module) with oxc, choosing the language from the file name. */
export function parseProse(source: string, fileName: string): ParseResult & { program: OxcNode } {
  return parseSync(fileName, source, { sourceType: 'module', lang: langOf(fileName) }) as ParseResult & { program: OxcNode };
}

/** Keys that never hold child nodes (positions, ESLint back links and token lists). */
const SKIP_KEYS = new Set(['type', 'start', 'end', 'range', 'loc', 'parent', 'tokens', 'comments']);

/**
 * Depth-first walk over every node under `root` (arrays included). `visit` returns `false` to skip the node's
 * children. `parent` is the closest enclosing node.
 */
export function walkAst<N extends AstNode = AstNode>(root: unknown, visit: (node: N, parent: N | undefined) => void | boolean): void {
  const walk = (value: unknown, parent: N | undefined): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, parent);
      return;
    }
    const node = value as N;
    if (typeof node.type === 'string' && visit(node, parent) === false) return;
    const next = typeof node.type === 'string' ? node : parent;
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child, next);
    }
  };
  walk(root, undefined);
}

/** `[start, end)` of a node from oxc (`start`/`end`) or ESLint (`range`). */
export function rangeOf(node: AstNode): [number, number] {
  if (node.range) return node.range;
  return [node.start ?? 0, node.end ?? 0];
}

/** Text of a JSX name node: `P`, `List.Item`, `svg:path`; `undefined` for anything else. */
export function jsxName(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  switch (node.type) {
    case 'JSXIdentifier':
      return node.name as string;
    case 'JSXMemberExpression': {
      const object = jsxName(node.object as AstNode);
      const property = jsxName(node.property as AstNode);
      return object === undefined || property === undefined ? undefined : `${object}.${property}`;
    }
    case 'JSXNamespacedName':
      return `${jsxName(node.namespace as AstNode)}:${jsxName(node.name as AstNode)}`;
    default:
      return undefined;
  }
}

/** Tag name of a `JSXElement` (`undefined` for fragments). */
export function elementName(element: AstNode): string | undefined {
  return jsxName((element.openingElement as AstNode | undefined)?.name as AstNode | undefined);
}

//
// JSX children
//

/**
 * One JSX child, classified the way the TSProse runtime reads it:
 * - `text`: JSX text with content; `whitespace`: JSX text that is only whitespace;
 * - `space` (`{' '}`, any whitespace-only string), `glue` (`{''}`), `break` (`{' '}`): static string
 *   expressions with a whitespace meaning (string literals and templates without substitutions alike);
 * - `string`: any other static string expression (`{'a'}`, `` {`a`} ``); `template`: a template literal with
 *   substitutions (a string at runtime, unknown statically); `literal`: a non-string literal (`{1}`, `{null}`);
 * - `comment`: `{/* … *\/}`; `element` / `fragment`; `expression`: anything else.
 */
export type JsxChild<N extends AstNode = AstNode> =
  | { readonly kind: 'text' | 'whitespace'; readonly node: N; readonly raw: string }
  | { readonly kind: 'space' | 'glue' | 'break' | 'string'; readonly node: N; readonly value: string }
  | { readonly kind: 'template'; readonly node: N }
  | { readonly kind: 'literal'; readonly node: N; readonly value: unknown }
  | { readonly kind: 'comment'; readonly node: N }
  | { readonly kind: 'element'; readonly node: N; readonly name: string | undefined }
  | { readonly kind: 'fragment'; readonly node: N }
  | { readonly kind: 'expression'; readonly node: N; readonly expression: N };

/** Value of a string literal or of a template literal without substitutions; `undefined` otherwise. */
export function staticString(expression: AstNode): string | undefined {
  if (expression.type === 'Literal') return typeof expression.value === 'string' ? expression.value : undefined;
  if (expression.type === 'TemplateLiteral' && (expression.expressions as AstNode[]).length === 0) {
    const quasi = (expression.quasis as AstNode[])[0];
    if (!quasi) return '';
    const value = quasi.value as { cooked?: string | null; raw: string };
    return value.cooked ?? value.raw;
  }
  return undefined;
}

/** Classify a JSX child (see {@link JsxChild}). */
export function classifyJsxChild<N extends AstNode>(child: N, source: string): JsxChild<N> {
  switch (child.type) {
    case 'JSXText': {
      const [s, e] = rangeOf(child);
      const raw = source.slice(s, e);
      return { kind: isJsxWhitespace(raw) ? 'whitespace' : 'text', node: child, raw };
    }
    case 'JSXExpressionContainer': {
      const expression = child.expression as N;
      if (expression.type === 'JSXEmptyExpression') return { kind: 'comment', node: child };
      const value = staticString(expression);
      if (value !== undefined) {
        const kind =
          value === '' ? 'glue' : value === PARAGRAPH_SEPARATOR ? 'break' : isJsxWhitespace(value) ? 'space' : 'string';
        return { kind, node: child, value };
      }
      if (expression.type === 'TemplateLiteral') return { kind: 'template', node: child };
      if (expression.type === 'Literal') return { kind: 'literal', node: child, value: expression.value };
      return { kind: 'expression', node: child, expression };
    }
    case 'JSXElement':
      return { kind: 'element', node: child, name: elementName(child) };
    case 'JSXFragment':
      return { kind: 'fragment', node: child };
    default:
      // JSXSpreadChild and anything a future parser adds.
      return { kind: 'expression', node: child, expression: child };
  }
}

//
// Whitespace
//

const JSX_WHITESPACE_ONLY = /^[ \t\r\n\f]*$/;
const LEADING_WHITESPACE = /^[ \t\r\n\f]*/;
const TRAILING_WHITESPACE = /[ \t\r\n\f]*$/;

/** Whether `text` is empty or only JSX whitespace (space, tab, CR, LF, form feed). */
export function isJsxWhitespace(text: string): boolean {
  return JSX_WHITESPACE_ONLY.test(text);
}

/** Leading JSX whitespace of `text`. */
export function leadingWhitespace(text: string): string {
  return LEADING_WHITESPACE.exec(text)![0];
}

/** Trailing JSX whitespace of `text`. */
export function trailingWhitespace(text: string): string {
  return TRAILING_WHITESPACE.exec(text)![0];
}

/** Whether `text` contains a line break (`\n` or `\r`). */
export function hasNewline(text: string): boolean {
  return /[\r\n]/.test(text);
}

/** Whether `text` contains a blank line (see {@link BLANK_RUN}). */
export function hasBlankLine(text: string): boolean {
  BLANK_RUN.lastIndex = 0;
  const found = BLANK_RUN.test(text);
  BLANK_RUN.lastIndex = 0;
  return found;
}

//
// Line endings and positions
//

export type Eol = '\n' | '\r\n';

/** The file's line ending by majority vote (`\r\n` vs a lone `\n` or `\r`); `\n` on a tie or without line breaks. */
export function detectEol(source: string): Eol {
  let crlf = 0;
  let other = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 13) {
      if (source.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else other++;
    } else if (ch === 10) other++;
  }
  return crlf > other ? '\r\n' : '\n';
}

/**
 * Normalize every line ending (`\r\n`, lone `\r`) to `\n`. A doubled CR before LF (`\r\r\n`, what some tools make of
 * CRLF inside template literals) is one line ending.
 */
export function toLf(text: string): string {
  return text.replace(/\r*\n|\r/g, '\n');
}

/** Turn LF text back into `eol` line endings. */
export function restoreEol(text: string, eol: Eol): string {
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}

/** Offsets where each line starts; a line ends at `\n`, `\r\n` or a lone `\r`. */
export function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 10) starts.push(i + 1);
    else if (ch === 13) {
      if (source.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

/** 1-based line and column of an offset, given {@link computeLineStarts}. */
export function positionOf(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

//
// Files
//

/** Default prose file pattern: `.tsx` and `.jsx`. */
export const PROSE_FILE = /\.(tsx|jsx)$/;

/**
 * Prose files under `path` (or `path` itself when it is a file), depth first. `node_modules` and dot-entries are
 * skipped. Throws `ENOENT` for a missing path.
 */
export async function* walkProseFiles(path: string, pattern: RegExp = PROSE_FILE): AsyncGenerator<string> {
  const info = await stat(path);
  if (info.isFile()) {
    yield path;
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* walkProseFiles(full, pattern);
    else if (pattern.test(entry.name)) yield full;
  }
}

/** The paths of `paths` that do not exist. */
export async function missingPaths(paths: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const path of paths) {
    try {
      await stat(path);
    } catch {
      missing.push(path);
    }
  }
  return missing;
}

//
// tsprose.config.ts
//

/** A JSON tags description (`describeTags` output), structurally: `{ version: 1, tags: {…} }`. */
export interface TagsDescriptionJson {
  readonly version: 1;
  readonly tags: Readonly<Record<string, unknown>>;
}

/**
 * The one `tsprose.config.ts` schema shared by `@tsprose/fmt`, `@tsprose/analyzer` and the editor extension.
 *
 * Tags come from exactly one source:
 * - `manifest`: a JSON tags description (`describeTags` output) or a path to one, relative to the config file;
 * - `tags`: a JSX name → tag map (TypeScript config modules only), plus `inlineComponents`;
 * - `inlineTags`/`blockTags`/`inlineContainers`: plain name lists (formatter only).
 */
export interface TsproseConfig {
  readonly manifest?: TagsDescriptionJson | string | undefined;
  readonly tags?: Readonly<Record<string, unknown>> | undefined;
  /** Component functions (not tags) known to produce inline content. */
  readonly inlineComponents?: readonly string[] | undefined;
  /** Whether a kit wraps loose inline content in block containers (analyzer; default true with `manifest`). */
  readonly wrapsLooseInline?: boolean | undefined;
  /** Whether the whitespace transform is part of the build (default true). */
  readonly transform?: boolean | undefined;
  /** Tags whose text is LaTeX (analyzer `braces` rule); default: every tag. */
  readonly mathTags?: readonly string[] | undefined;

  // Formatter options.
  readonly printWidth?: number | undefined;
  readonly indent?: number | 'tab' | undefined;
  readonly preFormat?: unknown;
  readonly refFirst?: boolean | undefined;
  readonly inlineTags?: readonly string[] | undefined;
  readonly blockTags?: readonly string[] | undefined;
  readonly inlineContainers?: readonly string[] | undefined;
  readonly blockCalls?: readonly string[] | undefined;
  readonly separateBlocks?: boolean | undefined;
  readonly compactContainers?: readonly string[] | undefined;
  readonly closing?: string | undefined;
  readonly opening?: string | undefined;
}

export interface LoadedConfig {
  /** Absolute path of the config file. */
  readonly path: string;
  /** The config, with `manifest` loaded when it was a path. */
  readonly config: TsproseConfig;
  /** The module namespace (TypeScript/JS configs only): a module may export tags directly instead of a config. */
  readonly module: Readonly<Record<string, unknown>> | undefined;
  /** Problems worth telling the user about (conflicting keys). */
  readonly warnings: readonly string[];
}

function isTagsDescriptionJson(value: unknown): value is TagsDescriptionJson {
  return typeof value === 'object' && value !== null && (value as TagsDescriptionJson).version === 1 && typeof (value as TagsDescriptionJson).tags === 'object';
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

/**
 * Load a `tsprose.config.ts` (any module the runtime can import: Bun, or Node with type stripping) or a JSON tags
 * description (`.json`, as if it were `{ manifest }`). A module provides the config as its default export or as
 * named exports.
 */
export async function loadTsproseConfig(path: string): Promise<LoadedConfig> {
  const absolute = resolve(path);
  if (absolute.endsWith('.json')) {
    const json = await readJson(absolute);
    if (!isTagsDescriptionJson(json)) throw new Error(`${path}: not a TSProse tags description (expected { version: 1, tags })`);
    return { path: absolute, config: { manifest: json }, module: undefined, warnings: [] };
  }
  const module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  const raw = (module.default && typeof module.default === 'object' ? module.default : module) as TsproseConfig;
  let manifest = raw.manifest;
  if (typeof manifest === 'string') {
    const file = resolve(dirname(absolute), manifest);
    const json = await readJson(file);
    if (!isTagsDescriptionJson(json)) throw new Error(`${file}: not a TSProse tags description (expected { version: 1, tags })`);
    manifest = json;
  } else if (manifest !== undefined && !isTagsDescriptionJson(manifest)) {
    throw new Error(`${path}: "manifest" must be a tags description or a path to one`);
  }
  const warnings: string[] = [];
  const sources = (['manifest', 'tags', 'inlineTags'] as const).filter((key) => raw[key] !== undefined);
  if (sources.length > 1) {
    warnings.push(`${path}: ${sources.map((k) => `"${k}"`).join(' and ')} both describe tags; "${sources[0]}" is used, the rest is ignored`);
  }
  if (raw.compactContainers?.length && raw.separateBlocks !== true) {
    warnings.push(`${path}: "compactContainers" has no effect without "separateBlocks: true"`);
  }
  return { path: absolute, config: { ...raw, manifest }, module, warnings };
}
