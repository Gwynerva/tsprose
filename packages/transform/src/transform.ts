import MagicString, { type SourceMap } from 'magic-string';
import { parseSync } from 'oxc-parser';

/**
 * TSProse whitespace rule: inside JSX, a line break between two pieces of inline content is a
 * space — as in TeX and Markdown. Standard JSX silently drops it, which forces `{' '}` hacks.
 *
 * The transform keeps the file valid, standard TSX: it only inserts `{" "}` at the boundaries
 * where JSX would have dropped a meaningful line break. Idempotent; type checking is unaffected.
 */

export interface TransformOptions {
  /** Closing punctuation: no space is inserted before a text starting with one of these. */
  readonly closing?: string | undefined;
  /** Opening punctuation: no space is inserted after a text ending with one of these. */
  readonly opening?: string | undefined;
  /** Whether to produce a source map (default true). */
  readonly sourceMap?: boolean | undefined;
  /**
   * Tells which JSX tag names are block-level. Between two known blocks no space is inserted
   * (it would be dropped by the runtime anyway); pass your kit's tag names to keep output tidy.
   */
  readonly isBlock?: ((tagName: string) => boolean) | undefined;
  /**
   * "Blank line = new paragraph": a blank line between inline content inside a JSX container inserts
   * `{"\u2029"}` (the Unicode paragraph separator); the runtime autowrap turns each segment of loose
   * inline content into its own paragraph. Off by default.
   */
  readonly paragraphs?: boolean | undefined;
  /**
   * Record source positions without the dev JSX runtime: every JSX element gets a hidden
   * `__tsprosePos={[file, line, column]}` attribute that the TSProse runtime turns into `node.pos`
   * (so diagnostics show `file:line:column` under jiti or production builds). Off by default.
   */
  readonly positions?: boolean | undefined;
  /** File name recorded by `positions` (default: the `fileName` argument). */
  readonly positionsFile?: string | undefined;
}

export interface Insertion {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
  /**
   * 'text' when text is on at least one side of the boundary, 'elements' between two elements/expressions,
   * 'paragraph' for a paragraph separator inserted at a blank line.
   */
  readonly between: 'text' | 'elements' | 'paragraph';
}

export interface TransformResult {
  readonly code: string;
  readonly map: SourceMap | undefined;
  /** Positions (in the original source) where `{" "}` was inserted. */
  readonly insertions: readonly Insertion[];
  /** Parse errors reported by oxc (the transform still runs on the recoverable AST). */
  readonly errors: readonly string[];
}

export const DEFAULT_CLOSING = '.,;:!?)]}»”’…';
export const DEFAULT_OPENING = '([{«“‘';

const SPACE = '{" "}';
const BREAK = '{"\\u2029"}';
const PARAGRAPH_SEPARATOR = '\u2029';

interface Item {
  readonly kind: 'text' | 'element' | 'expression' | 'comment' | 'space' | 'explicitSpace' | 'glue' | 'break';
  readonly start: number;
  readonly end: number;
  /** text items: offsets of the first/last non-whitespace characters */
  readonly contentStart?: number;
  readonly contentEnd?: number;
  readonly leadingNewline?: boolean;
  readonly trailingNewline?: boolean;
  readonly firstChar?: string;
  readonly lastChar?: string;
  readonly leadingBlank?: boolean;
  readonly trailingBlank?: boolean;
  /** whitespace-only text between siblings */
  readonly separatorNewline?: boolean;
  readonly separatorBlank?: boolean;
  /** element items: tag name (undefined for fragments) */
  readonly tagName?: string | undefined;
}

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const WS = /[ \t\r\n\f]/;

function hasNewline(text: string): boolean {
  return /[\r\n]/.test(text);
}

// One newline is \r\n, \n or a lone \r (never the \r of a \r\n pair: CRLF files must not see blank lines everywhere).
const BLANK_RUN = /(?:\r\n|\r(?!\n)|\n)[ \t\f]*(?:(?:\r\n|\r(?!\n)|\n)[ \t\f]*)+/g;

function hasBlankLine(text: string): boolean {
  BLANK_RUN.lastIndex = 0;
  return BLANK_RUN.test(text);
}

export function transform(source: string, fileName: string, options: TransformOptions = {}): TransformResult {
  const closing = options.closing ?? DEFAULT_CLOSING;
  const opening = options.opening ?? DEFAULT_OPENING;
  const parsed = parseSync(fileName, source, { sourceType: 'module', lang: fileName.endsWith('.jsx') ? 'jsx' : 'tsx' });
  const insertions = new Map<number, { between: 'text' | 'elements' | 'paragraph'; text: string }>();
  const isBlock = options.isBlock;
  const paragraphs = options.paragraphs === true;
  const positionAt: number[] = [];

  const visitChildren = (children: AstNode[]): void => {
    const items: Item[] = [];
    for (const child of children) {
      switch (child.type) {
        case 'JSXText': {
          const raw = source.slice(child.start, child.end);
          if (/^[ \t\r\n\f]*$/.test(raw)) {
            items.push({ kind: 'space', start: child.start, end: child.end, separatorNewline: hasNewline(raw), separatorBlank: hasBlankLine(raw) });
          } else {
            const lead = raw.match(/^[ \t\r\n\f]*/)![0];
            const trail = raw.match(/[ \t\r\n\f]*$/)![0];
            const contentStart = child.start + lead.length;
            const contentEnd = child.end - trail.length;
            items.push({
              kind: 'text',
              start: child.start,
              end: child.end,
              contentStart,
              contentEnd,
              leadingNewline: hasNewline(lead),
              trailingNewline: hasNewline(trail),
              leadingBlank: hasBlankLine(lead),
              trailingBlank: hasBlankLine(trail),
              firstChar: source[contentStart]!,
              lastChar: source[contentEnd - 1]!,
            });
            if (paragraphs) {
              // Blank lines inside the text body: a paragraph break after each run.
              const body = source.slice(contentStart, contentEnd);
              BLANK_RUN.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = BLANK_RUN.exec(body)) !== null) {
                insertions.set(contentStart + m.index + m[0].length, { between: 'paragraph', text: BREAK });
              }
            }
          }
          break;
        }
        case 'JSXExpressionContainer': {
          const expression = child.expression as AstNode;
          if (expression.type === 'JSXEmptyExpression') {
            items.push({ kind: 'comment', start: child.start, end: child.end });
          } else if (expression.type === 'Literal' && typeof expression.value === 'string') {
            const value = expression.value;
            items.push({ kind: literalKind(value), start: child.start, end: child.end });
          } else if (expression.type === 'TemplateLiteral' && (expression.quasis as AstNode[]).length === 1 && (expression.expressions as AstNode[]).length === 0) {
            const quasi = (expression.quasis as AstNode[])[0]!;
            const value = String((quasi.value as { cooked?: string; raw: string }).cooked ?? (quasi.value as { raw: string }).raw);
            items.push({ kind: literalKind(value), start: child.start, end: child.end });
          } else {
            items.push({ kind: 'expression', start: child.start, end: child.end });
          }
          break;
        }
        case 'JSXElement':
          items.push({ kind: 'element', start: child.start, end: child.end, tagName: jsxTagName(child) });
          break;
        case 'JSXFragment':
          items.push({ kind: 'element', start: child.start, end: child.end });
          break;
        default:
          items.push({ kind: 'expression', start: child.start, end: child.end });
      }
    }

    // Walk boundaries between content items.
    let prev: Item | undefined;
    let newlineBetween = false;
    let blankBetween = false;
    for (const item of items) {
      if (item.kind === 'space') {
        if (item.separatorNewline) newlineBetween = true;
        if (item.separatorBlank) blankBetween = true;
        continue;
      }
      if (item.kind === 'comment') {
        // A blank line before a comment: the paragraph break goes before the comment (it stays with what follows),
        // which keeps the comment's place when another formatter re-lays the file out. Comments are transparent.
        const blankBefore = blankBetween || (prev?.kind === 'text' && prev.trailingBlank === true);
        if (paragraphs && prev && prev.kind !== 'break' && blankBefore) {
          insertions.set(item.start, { between: 'paragraph', text: BREAK });
          prev = { kind: 'break', start: item.start, end: item.start };
          blankBetween = false;
          newlineBetween = false;
        }
        if (hasNewline(source.slice(item.start, item.end))) newlineBetween = true;
        continue;
      }
      if (item.kind === 'explicitSpace') {
        // An explicit {' '} already provides the space on both sides.
        prev = item;
        newlineBetween = false;
        blankBetween = false;
        continue;
      }
      if (prev) {
        const brokeLine =
          newlineBetween || (prev.kind === 'text' && prev.trailingNewline) || (item.kind === 'text' && item.leadingNewline);
        const brokeParagraph =
          paragraphs &&
          (blankBetween || (prev.kind === 'text' && prev.trailingBlank) || (item.kind === 'text' && item.leadingBlank));
        const touchesBreak = prev.kind === 'break' || item.kind === 'break';
        if (brokeParagraph && !touchesBreak) {
          insertions.set(item.kind === 'text' ? item.contentStart! : item.start, { between: 'paragraph', text: BREAK });
        } else if (brokeLine && !touchesBreak && prev.kind !== 'glue' && item.kind !== 'glue') {
          const prevSpace = prev.kind === 'explicitSpace';
          const closes = item.kind === 'text' && closing.includes(item.firstChar!);
          const opens = prev.kind === 'text' && opening.includes(prev.lastChar!);
          const bothBlocks =
            !!isBlock && prev.tagName !== undefined && item.tagName !== undefined && isBlock(prev.tagName) && isBlock(item.tagName);
          if (!prevSpace && !closes && !opens && !bothBlocks) {
            const between = prev.kind === 'text' || item.kind === 'text' ? 'text' : 'elements';
            insertions.set(item.kind === 'text' ? item.contentStart! : item.start, { between, text: SPACE });
          }
        }
      }
      prev = item;
      newlineBetween = false;
      blankBetween = false;
    }
  };

  const literalKind = (value: string): Item['kind'] =>
    value === '' ? 'glue' : value === PARAGRAPH_SEPARATOR ? 'break' : /^[ \t\r\n\f]*$/.test(value) ? 'explicitSpace' : 'expression';

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    const n = node as AstNode;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      visitChildren(n.children as AstNode[]);
    }
    if (options.positions && n.type === 'JSXOpeningElement') {
      const name = n.name as AstNode;
      const hasPos = (n.attributes as AstNode[]).some((a) => a.type === 'JSXAttribute' && (a.name as AstNode).name === '__tsprosePos');
      if (!hasPos) positionAt.push(n.start, name.end);
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'range' || key === 'loc') continue;
      const value = n[key];
      if (value && typeof value === 'object') visit(value);
    }
  };
  visit(parsed.program);

  const ms = new MagicString(source);
  const sorted = [...insertions.keys()].sort((a, b) => a - b);
  const lineStarts = computeLineStarts(source);
  for (const offset of sorted) ms.appendLeft(offset, insertions.get(offset)!.text);
  for (let i = 0; i < positionAt.length; i += 2) {
    const { line, column } = positionOf(lineStarts, positionAt[i]!);
    ms.appendLeft(positionAt[i + 1]!, ` __tsprosePos={[__tsproseFile, ${line}, ${column}]}`);
  }
  if (positionAt.length) {
    ms.prepend(`const __tsproseFile = ${JSON.stringify(options.positionsFile ?? fileName)};\n`);
  }
  const changed = sorted.length > 0 || positionAt.length > 0;

  return {
    code: changed ? ms.toString() : source,
    map: options.sourceMap === false || !changed ? undefined : ms.generateMap({ source: fileName, hires: true, includeContent: true }),
    insertions: sorted.map((offset) => {
      const { line, column } = positionOf(lineStarts, offset);
      return { offset, line, column, between: insertions.get(offset)!.between };
    }),
    errors: parsed.errors.map((e) => e.message),
  };
}

function jsxTagName(element: AstNode): string | undefined {
  const name = (element.openingElement as AstNode | undefined)?.name as AstNode | undefined;
  if (!name) return undefined;
  if (name.type === 'JSXIdentifier') return name.name as string;
  if (name.type === 'JSXMemberExpression') return `${jsxNameText(name.object as AstNode)}.${(name.property as AstNode).name as string}`;
  if (name.type === 'JSXNamespacedName') return `${(name.namespace as AstNode).name as string}:${(name.name as AstNode).name as string}`;
  return undefined;
}

function jsxNameText(node: AstNode): string {
  if (node.type === 'JSXIdentifier') return node.name as string;
  if (node.type === 'JSXMemberExpression') return `${jsxNameText(node.object as AstNode)}.${(node.property as AstNode).name as string}`;
  return '?';
}

function computeLineStarts(source: string): number[] {
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

function positionOf(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

/** Quick check used by plugins to skip files without JSX. */
export function mayContainJsx(source: string): boolean {
  return source.includes('<');
}

export { WS };
