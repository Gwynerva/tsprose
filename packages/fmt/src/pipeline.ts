import { parseSync } from 'oxc-parser';
import { transform } from '@tsprose/transform';
import { format, type FormatOptions, type FormatResult } from './format.js';

/** Options passed to oxfmt (its `FormatConfig`); typed loosely so oxfmt stays an optional dependency. */
export type OxfmtOptions = Readonly<Record<string, unknown>>;

/**
 * A code formatter run before the prose pass: it owns code outside the prose trees, attribute values and
 * expressions (imports, helpers, `snippet={{ … }}`, scripts); `tsprose-fmt` then re-prints the prose itself.
 * - `'oxfmt'`: oxfmt (optional peer dependency) with `printWidth`/indent taken from these options;
 * - `{ oxfmt: { singleQuote: true, … } }`: oxfmt with extra options;
 * - a function: any formatter (Prettier, Biome, dprint…); it receives standard-JSX source and must keep its meaning.
 */
export type PreFormat =
  | false
  | 'oxfmt'
  | { readonly oxfmt: OxfmtOptions }
  | ((code: string, fileName: string) => string | Promise<string>);

export interface PipelineOptions extends FormatOptions {
  readonly preFormat?: PreFormat | undefined;
}

interface OxfmtModule {
  format(fileName: string, code: string, options?: object): Promise<{ code: string; errors: { message: string }[] }>;
}

let oxfmtModule: Promise<OxfmtModule> | undefined;

function loadOxfmt(): Promise<OxfmtModule> {
  oxfmtModule ??= (import('oxfmt' as string) as Promise<OxfmtModule>).catch((error: unknown) => {
    oxfmtModule = undefined;
    throw new Error(`preFormat "oxfmt" needs the oxfmt package (bun add -d oxfmt): ${(error as Error).message}`);
  });
  return oxfmtModule;
}

async function runPreFormat(
  pre: Exclude<PreFormat, false>,
  code: string,
  fileName: string,
  options: FormatOptions,
  endOfLine: 'crlf' | 'lf',
): Promise<string> {
  if (typeof pre === 'function') return pre(code, fileName);
  const { format: oxfmt } = await loadOxfmt();
  const extra = typeof pre === 'object' ? pre.oxfmt : {};
  const indent = options.indent ?? 2;
  const result = await oxfmt(fileName, code, {
    printWidth: options.printWidth ?? 120,
    ...(indent === 'tab' ? { useTabs: true } : { tabWidth: indent }),
    endOfLine,
    ...extra,
  });
  if (result.errors.length) throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.code;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/** Tagged templates written as JSX children (`{m`…`}`, `{mm({ freeze: true })`…`}`): prose content, not code. */
function proseTemplates(source: string, fileName: string): Node[] | undefined {
  const parsed = parseSync(fileName, source, { sourceType: 'module', lang: fileName.endsWith('.jsx') ? 'jsx' : 'tsx' });
  if (parsed.errors.length) return undefined;
  const out: Node[] = [];
  const visit = (value: unknown, parent: Node | undefined): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const v of value) visit(v, parent);
      return;
    }
    const n = value as Node;
    if (n.type === 'TaggedTemplateExpression' && parent?.type === 'JSXExpressionContainer') out.push(n);
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const v = n[key];
      if (v && typeof v === 'object') visit(v, n);
    }
  };
  visit(parsed.program, undefined);
  return out;
}

/**
 * Put prose templates back as the author wrote them: a code formatter would lay out a long math template like a
 * call (`m({\n currentColor: true,\n })`…``). Matched by order; nothing is replaced if the counts differ.
 */
function keepProseTemplates(original: string, formatted: string, fileName: string): string {
  const before = proseTemplates(original, fileName);
  const after = proseTemplates(formatted, fileName);
  if (!before || !after || before.length !== after.length || before.length === 0) return formatted;
  let out = '';
  let cursor = 0;
  after.forEach((node, i) => {
    out += formatted.slice(cursor, node.start) + original.slice(before[i]!.start, before[i]!.end);
    cursor = node.end;
  });
  return out + formatted.slice(cursor);
}

/**
 * Format a prose file, optionally with a code formatter first (`preFormat`).
 *
 * Code formatters follow standard JSX semantics, where a line break next to a tag is *not* a space and blank lines
 * mean nothing: handing them TSProse prose as written would glue words and merge paragraphs. So the pipeline is
 * 1. `@tsprose/transform` makes the source standard-JSX equivalent (`{" "}` for line breaks, `{"\u2029"}` for
 *    blank lines);
 * 2. the code formatter formats everything, preserving that meaning;
 * 3. the prose pass re-prints the prose trees, turning those markers back into line breaks and blank lines.
 * Without `preFormat` this is exactly {@link format}.
 */
export async function formatAsync(source: string, fileName: string, options: PipelineOptions = {}): Promise<FormatResult> {
  const pre = options.preFormat;
  if (!pre) return format(source, fileName, options);
  // The whole pipeline runs on LF text; the file's line endings are restored at the end. (Handing CRLF text to a
  // code formatter with endOfLine "crlf" doubles the CR inside template literals.)
  const crlf = source.includes('\r\n');
  const lf = crlf ? source.replace(/\r\n/g, '\n') : source;
  let input: string;
  try {
    const standard =
      options.transform === false
        ? lf
        : transform(lf, fileName, { paragraphs: true, sourceMap: false, closing: options.closing, opening: options.opening }).code;
    input = await runPreFormat(pre, standard, fileName, options, 'lf');
  } catch (error) {
    return { code: source, changed: false, errors: [`preFormat failed: ${(error as Error).message}`] };
  }
  input = keepProseTemplates(lf, input.replace(/\r*\n/g, '\n'), fileName);
  if (crlf) input = input.replace(/\n/g, '\r\n');
  // The code formatter's output is standard JSX: read it as such, print it with the TSProse rules.
  const result = format(input, fileName, { ...options, input: 'jsx' });
  return { ...result, changed: result.code !== source };
}
