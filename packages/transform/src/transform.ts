import MagicString, { type SourceMap } from 'magic-string';
import {
  BLANK_RUN,
  DEFAULT_CLOSING,
  DEFAULT_OPENING,
  classifyJsxChild,
  computeLineStarts,
  hasBlankLine,
  hasNewline,
  leadingWhitespace,
  parseProse,
  positionOf,
  trailingWhitespace,
  walkAst,
  type OxcNode,
} from './tooling.js';

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
  /**
   * Parse errors reported by oxc. The transform still runs on the recoverable AST; bundler plugins leave a file
   * with parse errors untouched (the bundler then reports the error on the original source).
   */
  readonly errors: readonly string[];
}

export { DEFAULT_CLOSING, DEFAULT_OPENING };

const SPACE = '{" "}';
const BREAK = '{"\\u2029"}';

interface Item {
  readonly kind:
    | 'text'
    | 'element'
    | 'expression'
    | 'comment'
    | 'space'
    | 'explicitSpace'
    | 'glue'
    | 'break';
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

export function transform(
  source: string,
  fileName: string,
  options: TransformOptions = {},
): TransformResult {
  const closing = options.closing ?? DEFAULT_CLOSING;
  const opening = options.opening ?? DEFAULT_OPENING;
  const parsed = parseProse(source, fileName);
  const insertions = new Map<
    number,
    { between: 'text' | 'elements' | 'paragraph'; text: string }
  >();
  const isBlock = options.isBlock;
  const paragraphs = options.paragraphs === true;
  /** Pairs [element start, attribute insertion offset]. */
  const positionAt: number[] = [];

  const visitChildren = (children: OxcNode[]): void => {
    const items: Item[] = [];
    for (const node of children) {
      const child = classifyJsxChild(node, source);
      switch (child.kind) {
        case 'whitespace':
          items.push({
            kind: 'space',
            start: node.start,
            end: node.end,
            separatorNewline: hasNewline(child.raw),
            separatorBlank: hasBlankLine(child.raw),
          });
          break;
        case 'text': {
          const raw = child.raw;
          const lead = leadingWhitespace(raw);
          const trail = trailingWhitespace(raw);
          const contentStart = node.start + lead.length;
          const contentEnd = node.end - trail.length;
          items.push({
            kind: 'text',
            start: node.start,
            end: node.end,
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
            for (const m of body.matchAll(BLANK_RUN)) {
              insertions.set(contentStart + m.index + m[0].length, {
                between: 'paragraph',
                text: BREAK,
              });
            }
          }
          break;
        }
        case 'comment':
        case 'glue':
        case 'break':
          items.push({ kind: child.kind, start: node.start, end: node.end });
          break;
        case 'space':
          items.push({
            kind: 'explicitSpace',
            start: node.start,
            end: node.end,
          });
          break;
        case 'element':
          items.push({
            kind: 'element',
            start: node.start,
            end: node.end,
            tagName: child.name,
          });
          break;
        case 'fragment':
          items.push({ kind: 'element', start: node.start, end: node.end });
          break;
        default:
          items.push({ kind: 'expression', start: node.start, end: node.end });
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
        const blankBefore =
          blankBetween ||
          (prev?.kind === 'text' && prev.trailingBlank === true);
        if (paragraphs && prev && prev.kind !== 'break' && blankBefore) {
          insertions.set(item.start, { between: 'paragraph', text: BREAK });
          prev = { kind: 'break', start: item.start, end: item.start };
          blankBetween = false;
          newlineBetween = false;
        }
        if (hasNewline(source.slice(item.start, item.end)))
          newlineBetween = true;
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
          newlineBetween ||
          (prev.kind === 'text' && prev.trailingNewline) ||
          (item.kind === 'text' && item.leadingNewline);
        const brokeParagraph =
          paragraphs &&
          (blankBetween ||
            (prev.kind === 'text' && prev.trailingBlank) ||
            (item.kind === 'text' && item.leadingBlank));
        const touchesBreak = prev.kind === 'break' || item.kind === 'break';
        if (brokeParagraph && !touchesBreak) {
          insertions.set(
            item.kind === 'text' ? item.contentStart! : item.start,
            { between: 'paragraph', text: BREAK },
          );
        } else if (
          brokeLine &&
          !touchesBreak &&
          prev.kind !== 'glue' &&
          item.kind !== 'glue'
        ) {
          const prevSpace = prev.kind === 'explicitSpace';
          const closes =
            item.kind === 'text' && closing.includes(item.firstChar!);
          const opens =
            prev.kind === 'text' && opening.includes(prev.lastChar!);
          const bothBlocks =
            !!isBlock &&
            prev.tagName !== undefined &&
            item.tagName !== undefined &&
            isBlock(prev.tagName) &&
            isBlock(item.tagName);
          if (!prevSpace && !closes && !opens && !bothBlocks) {
            const between =
              prev.kind === 'text' || item.kind === 'text'
                ? 'text'
                : 'elements';
            insertions.set(
              item.kind === 'text' ? item.contentStart! : item.start,
              { between, text: SPACE },
            );
          }
        }
      }
      prev = item;
      newlineBetween = false;
      blankBetween = false;
    }
  };

  walkAst<OxcNode>(parsed.program, (n) => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment')
      visitChildren(n.children as OxcNode[]);
    if (options.positions && n.type === 'JSXOpeningElement') {
      const hasPos = (n.attributes as OxcNode[]).some(
        (a) =>
          a.type === 'JSXAttribute' &&
          (a.name as OxcNode).name === '__tsprosePos',
      );
      // The attribute goes after the name and its type arguments (`<List<Item> …>`).
      const after =
        (n.typeArguments as OxcNode | null | undefined) ?? (n.name as OxcNode);
      if (!hasPos) positionAt.push(n.start, after.end);
    }
  });

  const ms = new MagicString(source);
  const sorted = [...insertions.keys()].sort((a, b) => a - b);
  const lineStarts = computeLineStarts(source);
  for (const offset of sorted)
    ms.appendLeft(offset, insertions.get(offset)!.text);
  for (let i = 0; i < positionAt.length; i += 2) {
    const { line, column } = positionOf(lineStarts, positionAt[i]!);
    ms.appendLeft(
      positionAt[i + 1]!,
      ` __tsprosePos={[__tsproseFile, ${line}, ${column}]}`,
    );
  }
  if (positionAt.length) {
    const declaration = `const __tsproseFile = ${JSON.stringify(options.positionsFile ?? fileName)};`;
    // After the hashbang and the directive prologue ('use client', 'use strict'), which must stay first.
    const prologueEnd = prologueEndOf(parsed.program);
    if (prologueEnd === 0) ms.prepend(`${declaration}\n`);
    else ms.appendLeft(prologueEnd, `\n${declaration}`);
  }
  const changed = sorted.length > 0 || positionAt.length > 0;

  return {
    code: changed ? ms.toString() : source,
    map:
      options.sourceMap === false || !changed
        ? undefined
        : ms.generateMap({
            source: fileName,
            hires: true,
            includeContent: true,
          }),
    insertions: sorted.map((offset) => {
      const { line, column } = positionOf(lineStarts, offset);
      return { offset, line, column, between: insertions.get(offset)!.between };
    }),
    errors: parsed.errors.map((e) => e.message),
  };
}

/** End offset of the hashbang and the leading directives of a program (0 when there are none). */
function prologueEndOf(program: OxcNode): number {
  let end = (program.hashbang as OxcNode | null | undefined)?.end ?? 0;
  for (const statement of program.body as OxcNode[]) {
    if (
      statement.type !== 'ExpressionStatement' ||
      typeof statement.directive !== 'string'
    )
      break;
    end = statement.end;
  }
  return end;
}

/**
 * Cheap pre-check used by the plugins to skip files without JSX: is there a `<` that can start a JSX element or
 * fragment (`<Name`, `<>`)? False positives (`a <b`) only cost a parse; there are no false negatives.
 */
export function mayContainJsx(source: string): boolean {
  return /<\s*[A-Za-z_$>]/.test(source);
}
