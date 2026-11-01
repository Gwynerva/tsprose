import {
  BLANK_RUN,
  DEFAULT_CLOSING,
  DEFAULT_OPENING,
  classifyJsxChild,
  detectEol,
  elementName,
  parseProse,
  restoreEol,
  toLf,
  walkAst,
  type OxcNode as AstNode,
} from '@tsprose/transform/tooling';

/**
 * @tsprose/fmt — a narrow, fast formatter for prose files.
 *
 * It re-prints only JSX regions (top-level JSX expressions); code outside JSX is left byte-for-byte.
 * Prose rules:
 *  - text is filled to `printWidth`; a line break is a space (the TSProse transform rule), so no `{' '}`
 *    is ever emitted in transform mode and existing ones are dropped;
 *  - an inline element never separates from the word it starts with (`<B>bold`), the word it ends with
 *    (`bold</B>`) or closing punctuation written right after it or on the next line (`</M>:`);
 *  - inline tags keep their attributes on one line; block tags break attributes one per line when too long;
 *  - block children go one per line, indented; single blank lines between block children are preserved;
 *  - a blank line inside loose text of a block container is a paragraph break and is preserved (inside an
 *    inline tag it is just a space);
 *  - expressions `{…}`, comments and attribute values are printed verbatim (re-indented when they span lines).
 */

export type Kind = 'block' | 'inline' | 'unknown';

export interface FormatOptions {
  readonly printWidth?: number | undefined;
  /** Indent unit: a number of spaces or a tab. */
  readonly indent?: number | 'tab' | undefined;
  /** `true` (default): the whitespace transform is in the build, line breaks are spaces. `false`: emit `{' '}` like JSX needs. */
  readonly transform?: boolean | undefined;
  /** Kind of a JSX tag name. Components default to `'unknown'` (treated as block). */
  readonly kindOf?: ((tagName: string) => Kind) | undefined;
  /**
   * Whether a tag accepts inline children only (`<P>`): a blank line inside it is a space, not a
   * paragraph break. Defaults to "inline tags are inline containers" (built from `tags` by the CLI).
   */
  readonly isInlineContainer?: ((tagName: string) => boolean) | undefined;
  /**
   * Functions whose calls produce block nodes (`{display\`…\`}`, `{display({ numbered: true })\`…\`}`, `{figure(…)}`):
   * such expressions are laid out on their own line like block tags instead of being filled into text.
   */
  readonly blockCalls?: readonly string[] | undefined;
  /**
   * Put exactly one blank line between consecutive block items (paragraphs of loose text, block tags,
   * block expressions) inside every block container, at any depth. `true` for all containers, or a
   * predicate on the container tag name (fragments pass `undefined`) to keep some compact (`<Table>`, `<List>`).
   * Default: off — existing blank lines are preserved (max one) and none are added.
   */
  readonly separateBlocks?:
    boolean | ((containerName: string | undefined) => boolean) | undefined;
  /** Print the `$` (ref) attribute first (elements with spread attributes keep their order). */
  readonly refFirst?: boolean | undefined;
  /**
   * How to read the input: `'tsprose'` (default; a line break is a space, a blank line a paragraph break) or
   * `'jsx'` (standard JSX: whitespace with a line break at a text edge means nothing, `{" "}` is a space,
   * `{"\u2029"}` a paragraph break) — the output of a code formatter in the `preFormat` pipeline.
   * The output is always printed with the TSProse rules.
   */
  readonly input?: 'tsprose' | 'jsx' | undefined;
  readonly closing?: string | undefined;
  readonly opening?: string | undefined;
}

export interface FormatResult {
  readonly code: string;
  readonly changed: boolean;
  readonly errors: readonly string[];
}

type Sep = 'none' | 'space' | 'newline';

interface Token {
  /** Printed text; may contain newlines (verbatim expressions, already re-indented). */
  readonly text: string;
  /** No space may be inserted before this token. */
  glueBefore: boolean;
}

interface Ctx {
  readonly source: string;
  readonly width: number;
  readonly unit: string;
  readonly transform: boolean;
  readonly kindOf: (name: string) => Kind;
  readonly isInlineContainer: (name: string) => boolean;
  readonly blockCalls: ReadonlySet<string>;
  readonly separateBlocks: (containerName: string | undefined) => boolean;
  readonly refFirst: boolean;
  readonly jsxInput: boolean;
  readonly closing: string;
  readonly opening: string;
}

// JSX whitespace plus a literal paragraph separator: nothing to print as a word.
const WS_ONLY = /^[ \t\r\n\f\u2029]*$/;

export function format(
  source: string,
  fileName: string,
  options: FormatOptions = {},
): FormatResult {
  const parsed = parseProse(source, fileName);
  const errors = parsed.errors.map((e) => e.message);
  if (errors.length) return { code: source, changed: false, errors };

  const ctx: Ctx = {
    source,
    width: options.printWidth ?? 120,
    unit: options.indent === 'tab' ? '\t' : ' '.repeat(options.indent ?? 2),
    transform: options.transform ?? true,
    kindOf: options.kindOf ?? (() => 'unknown'),
    isInlineContainer:
      options.isInlineContainer ??
      ((name) => (options.kindOf ?? (() => 'unknown'))(name) === 'inline'),
    blockCalls: new Set(options.blockCalls ?? []),
    separateBlocks:
      typeof options.separateBlocks === 'function'
        ? options.separateBlocks
        : () => options.separateBlocks === true,
    refFirst: options.refFirst === true,
    jsxInput: options.input === 'jsx',
    closing: options.closing ?? DEFAULT_CLOSING,
    opening: options.opening ?? DEFAULT_OPENING,
  };

  const regions: AstNode[] = [];
  collectRegions(parsed.program, regions);
  if (!regions.length) return { code: source, changed: false, errors };

  // Keep the file's line endings: printed regions use \n internally.
  const eol = detectEol(source);
  let out = '';
  let cursor = 0;
  for (const region of regions.sort((a, b) => a.start - b.start)) {
    out += source.slice(cursor, region.start);
    out += restoreEol(
      toLf(printBlockLike(region, lineIndent(source, region.start), ctx)),
      eol,
    );
    cursor = region.end;
  }
  out += source.slice(cursor);
  return { code: out, changed: out !== source, errors };
}

/** Outermost JSX elements and fragments under `root` (`root` itself excluded): the regions to print. */
function collectRegions(root: AstNode, out: AstNode[]): void {
  walkAst<AstNode>(root, (n) => {
    if (n === root || (n.type !== 'JSXElement' && n.type !== 'JSXFragment'))
      return;
    out.push(n);
    return false; // nested JSX inside expressions is printed as part of the region
  });
}

/**
 * Source of an expression (or attribute) with the JSX nested inside it formatted too:
 * `{helper(a, b, <List.Item>…</List.Item>)}`, `{cond && <P>…</P>}`. Code around the JSX stays verbatim.
 */
function verbatim(node: AstNode, ctx: Ctx): string {
  const regions: AstNode[] = [];
  collectRegions(node, regions);
  if (!regions.length) return ctx.source.slice(node.start, node.end);
  let out = '';
  let cursor = node.start;
  for (const region of regions.sort((a, b) => a.start - b.start)) {
    out += ctx.source.slice(cursor, region.start);
    out += printBlockLike(region, lineIndent(ctx.source, region.start), ctx);
    cursor = region.end;
  }
  return out + ctx.source.slice(cursor, node.end);
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, offset))![0];
}

/** Shift continuation lines of a verbatim snippet from the indentation it had in the source to `to`. */
function reindent(text: string, from: string, to: string): string {
  if (!text.includes('\n') || from === to) return text;
  return text
    .split('\n')
    .map((line, i) => {
      if (i === 0) return line;
      if (line.startsWith(from)) return to + line.slice(from.length);
      const trimmed = line.replace(/^[ \t]*/, '');
      return trimmed ? to + trimmed : '';
    })
    .join('\n');
}

//
// Element helpers
//

function isFragment(node: AstNode): boolean {
  return node.type === 'JSXFragment';
}

function tagName(node: AstNode): string {
  return elementName(node) ?? '?';
}

type Child =
  | { kind: 'text'; raw: string; node: AstNode }
  | { kind: 'blank' }
  | { kind: 'element'; node: AstNode; inline: boolean }
  | {
      kind: 'expression';
      node: AstNode;
      space: boolean;
      glue: boolean;
      block?: boolean;
    }
  | { kind: 'comment'; node: AstNode };

function childrenOf(node: AstNode, ctx: Ctx): Child[] {
  const out: Child[] = [];
  for (const child of node.children as AstNode[]) {
    const c = classifyJsxChild(child, ctx.source);
    switch (c.kind) {
      case 'text':
      case 'whitespace': {
        const raw = c.raw;
        if (WS_ONLY.test(raw)) {
          const newlines = raw.split(/\r\n|\r|\n/).length - 1;
          // Standard JSX input: blank lines carry no meaning (paragraph breaks arrive as {"\u2029"}).
          if (newlines >= 2 && !ctx.jsxInput) out.push({ kind: 'blank' });
          else if (raw.length) out.push({ kind: 'text', raw, node: child });
        } else if (ctx.jsxInput) {
          out.push({ kind: 'text', raw, node: child });
        } else {
          // Blank lines inside a text run are paragraph breaks: split the run around them.
          const parts = raw.split(BLANK_RUN);
          for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) out.push({ kind: 'blank' });
            else if (parts[i]!.length)
              out.push({ kind: 'text', raw: parts[i]!, node: child });
          }
        }
        break;
      }
      case 'comment':
        out.push({ kind: 'comment', node: child });
        break;
      case 'break':
        out.push({ kind: 'blank' });
        break;
      case 'space':
      case 'glue':
        out.push({
          kind: 'expression',
          node: child,
          space: c.kind === 'space',
          glue: c.kind === 'glue',
        });
        break;
      case 'element':
        out.push({
          kind: 'element',
          node: child,
          inline: ctx.kindOf(c.name ?? '?') === 'inline',
        });
        break;
      case 'fragment':
        out.push({ kind: 'element', node: child, inline: false });
        break;
      case 'expression':
        out.push({
          kind: 'expression',
          node: child,
          space: false,
          glue: false,
          block: isBlockCall(c.expression, ctx),
        });
        break;
      default:
        // Static strings, templates and other literals: printed verbatim, filled like words.
        out.push({
          kind: 'expression',
          node: child,
          space: false,
          glue: false,
        });
    }
  }
  return out;
}

function hasBlockChildren(children: Child[]): boolean {
  return children.some(
    (c) =>
      (c.kind === 'element' && !c.inline) ||
      (c.kind === 'expression' && c.block),
  );
}

/** `f\`…\``, `f(opts)\`…\``, `f(…)` where `f` is listed in `blockCalls`. */
function isBlockCall(expr: AstNode, ctx: Ctx): boolean {
  if (!ctx.blockCalls.size) return false;
  let callee: AstNode | undefined =
    expr.type === 'TaggedTemplateExpression'
      ? (expr.tag as AstNode)
      : expr.type === 'CallExpression'
        ? (expr.callee as AstNode)
        : undefined;
  if (callee?.type === 'CallExpression') callee = callee.callee as AstNode;
  return (
    callee?.type === 'Identifier' && ctx.blockCalls.has(callee.name as string)
  );
}

/** A blank line between two pieces of content (a paragraph break in a block container). */
function hasParagraphBreak(children: Child[]): boolean {
  const content = (c: Child) =>
    c.kind !== 'blank' && !(c.kind === 'text' && WS_ONLY.test(c.raw));
  let seen = false;
  for (let i = 0; i < children.length; i++) {
    const c = children[i]!;
    if (c.kind === 'blank' && seen && children.slice(i + 1).some(content))
      return true;
    if (content(c)) seen = true;
  }
  return false;
}

function hasContent(children: Child[]): boolean {
  return children.some((c) =>
    c.kind === 'text' ? !WS_ONLY.test(c.raw) : c.kind !== 'blank',
  );
}

function attributeTexts(node: AstNode, indent: string, ctx: Ctx): string[] {
  const opening = node.openingElement as AstNode;
  let attributes = opening.attributes as AstNode[];
  if (
    ctx.refFirst &&
    !attributes.some((a) => a.type === 'JSXSpreadAttribute')
  ) {
    const isRef = (a: AstNode) =>
      a.type === 'JSXAttribute' && (a.name as AstNode).name === '$';
    attributes = [
      ...attributes.filter(isRef),
      ...attributes.filter((a) => !isRef(a)),
    ];
  }
  return attributes.map((a) => {
    const text = verbatim(a, ctx).replace(/\s+$/, '');
    return reindent(text, lineIndent(ctx.source, a.start), indent);
  });
}

/** Opening tag. Block tags break attributes one per line when they do not fit or span lines; inline tags never break. */
function openTag(
  node: AstNode,
  indent: string,
  ctx: Ctx,
  selfClosing: boolean,
  inline: boolean,
): string {
  if (isFragment(node)) return selfClosing ? '<></>' : '<>';
  const name = tagName(node);
  const inner = indent + ctx.unit;
  const attrs = attributeTexts(node, inline ? indent : inner, ctx);
  const oneLine = `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? ' />' : '>'}`;
  if (inline || attrs.length === 0) return oneLine;
  const multiLine = attrs.some((a) => a.includes('\n'));
  if (!multiLine && indent.length + oneLine.length <= ctx.width) return oneLine;
  return `<${name}\n${attrs.map((a) => inner + a).join('\n')}\n${indent}${selfClosing ? '/>' : '>'}`;
}

function closeTag(node: AstNode): string {
  return isFragment(node) ? '</>' : `</${tagName(node)}>`;
}

//
// Block layout
//

function printBlockLike(node: AstNode, indent: string, ctx: Ctx): string {
  const children = childrenOf(node, ctx);
  const inner = indent + ctx.unit;

  if (!hasContent(children)) return openTag(node, indent, ctx, true, false);

  const inlineContainer =
    !isFragment(node) && ctx.isInlineContainer(tagName(node));
  if (
    !hasBlockChildren(children) &&
    (inlineContainer || !hasParagraphBreak(children))
  ) {
    const head = openTag(node, indent, ctx, false, false);
    const tail = closeTag(node);
    // A single verbatim expression hugs its tag: <Formula>{math`…`}</Formula>
    const only = children.filter(
      (c) => !(c.kind === 'text' && WS_ONLY.test(c.raw)) && c.kind !== 'blank',
    );
    if (
      only.length === 1 &&
      only[0]!.kind === 'expression' &&
      !only[0]!.space &&
      !only[0]!.glue &&
      !head.includes('\n')
    ) {
      const n = only[0]!.node;
      const text = reindent(
        verbatim(n, ctx),
        lineIndent(ctx.source, n.start),
        indent,
      );
      return head + text + tail;
    }
    const tokens = inlineTokens(children, inner, ctx);
    const single = tokens
      .map((t, i) => (i === 0 || t.glueBefore ? '' : ' ') + t.text)
      .join('');
    if (
      !head.includes('\n') &&
      !single.includes('\n') &&
      indent.length + head.length + single.length + tail.length <= ctx.width
    ) {
      return head + single + tail;
    }
    return `${head}\n${fill(tokens, inner, ctx)}\n${indent}${tail}`;
  }

  const lines: string[] = [openTag(node, indent, ctx, false, false)];
  const separate = ctx.separateBlocks(
    isFragment(node) ? undefined : tagName(node),
  );
  let run: Child[] = [];
  let runBlank = false;
  let pendingBlank = false;
  let items = 0;
  // A new block item starts: one blank line before it when the source had one or `separateBlocks` asks.
  const startItem = (blank: boolean) => {
    if (items > 0 && blank) lines.push('');
    items++;
  };
  const flushRun = () => {
    if (!run.length) return;
    const tokens = inlineTokens(run, inner, ctx);
    if (tokens.length) {
      startItem(runBlank);
      lines.push(fill(tokens, inner, ctx));
    }
    run = [];
  };
  for (const child of children) {
    if (child.kind === 'blank') {
      // Inside loose text a blank line ends the paragraph.
      flushRun();
      pendingBlank = true;
      continue;
    }
    if (child.kind === 'element' && !child.inline) {
      flushRun();
      startItem(pendingBlank || separate);
      pendingBlank = false;
      lines.push(inner + printBlockLike(child.node, inner, ctx));
      continue;
    }
    if (child.kind === 'expression' && child.block) {
      flushRun();
      startItem(pendingBlank || separate);
      pendingBlank = false;
      const n = child.node;
      lines.push(
        inner +
          reindent(verbatim(n, ctx), lineIndent(ctx.source, n.start), inner),
      );
      continue;
    }
    if (child.kind === 'text' && WS_ONLY.test(child.raw)) {
      if (run.length) run.push(child);
      continue;
    }
    if (run.length === 0) runBlank = pendingBlank || separate;
    pendingBlank = false;
    run.push(child);
  }
  flushRun();
  lines.push(indent + closeTag(node));
  return lines.join('\n');
}

//
// Inline tokens and fill
//

function sepOf(ws: string): Sep {
  if (!ws.length) return 'none';
  return /[\r\n]/.test(ws) ? 'newline' : 'space';
}

function maxSep(a: Sep, b: Sep): Sep {
  if (a === 'newline' || b === 'newline') return 'newline';
  if (a === 'space' || b === 'space') return 'space';
  return 'none';
}

/**
 * Turn inline children into tokens. Spaces between tokens follow the source, with the TSProse rule:
 * a line break is a space, except before closing punctuation / after opening punctuation, where it glues.
 */
function inlineTokens(children: Child[], indent: string, ctx: Ctx): Token[] {
  const tokens: Token[] = [];
  // Whitespace at a text edge: TSProse reads a line break as a space; standard JSX drops whitespace with a line break.
  const edgeSep = (ws: string): Sep =>
    ctx.jsxInput && /[\r\n]/.test(ws) ? 'none' : sepOf(ws);
  let pending: Sep = 'none';
  let forceGlue = false;

  const push = (text: string, forcedGlue = false) => {
    if (tokens.length === 0) {
      tokens.push({ text, glueBefore: false });
    } else {
      const prev = tokens[tokens.length - 1]!;
      let glue: boolean;
      if (forcedGlue || forceGlue) glue = true;
      else if (pending === 'none') glue = true;
      else if (pending === 'space') glue = false;
      else {
        // newline: a space, unless punctuation glues across the break
        const closes = ctx.closing.includes(text[0]!);
        const opens = ctx.opening.includes(prev.text[prev.text.length - 1]!);
        glue = closes || opens;
      }
      tokens.push({ text, glueBefore: glue });
    }
    pending = 'none';
    forceGlue = false;
  };

  for (const child of children) {
    switch (child.kind) {
      case 'blank':
        pending = 'newline';
        break;
      case 'text': {
        const raw = child.raw;
        if (WS_ONLY.test(raw)) {
          pending = maxSep(pending, edgeSep(raw));
          break;
        }
        const lead = raw.match(/^[ \t\r\n\f]*/)![0];
        const trail = raw.match(/[ \t\r\n\f]*$/)![0];
        pending = maxSep(pending, edgeSep(lead));
        const body = raw.slice(lead.length, raw.length - trail.length);
        const parts = body.split(/([ \t\r\n\f]+)/);
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!;
          if (i % 2 === 1)
            pending = maxSep(pending, ctx.jsxInput ? 'space' : sepOf(part));
          else if (part) push(part);
        }
        pending = maxSep(pending, edgeSep(trail));
        break;
      }
      case 'expression': {
        if (child.space) {
          pending = maxSep(pending, 'space');
          break;
        }
        if (child.glue) {
          forceGlue = true;
          pending = 'none';
          break;
        }
        const n = child.node;
        push(
          reindent(verbatim(n, ctx), lineIndent(ctx.source, n.start), indent),
        );
        break;
      }
      case 'comment': {
        const n = child.node;
        push(
          reindent(verbatim(n, ctx), lineIndent(ctx.source, n.start), indent),
        );
        break;
      }
      case 'element': {
        const node = child.node;
        if (!child.inline && !isFragment(node)) {
          push(printBlockLike(node, indent, ctx));
          break;
        }
        const grand = childrenOf(node, ctx);
        if (!hasContent(grand)) {
          push(openTag(node, indent, ctx, true, true));
          break;
        }
        push(openTag(node, indent, ctx, false, true));
        const innerTokens = inlineTokens(grand, indent, ctx);
        innerTokens.forEach((t, i) =>
          tokens.push({
            text: t.text,
            glueBefore: i === 0 ? true : t.glueBefore,
          }),
        );
        pending = 'none';
        forceGlue = false;
        push(closeTag(node), true);
        break;
      }
    }
  }
  return tokens;
}

/**
 * Greedy fill. A "unit" is a token plus every token glued after it (`<M>x^2</M>:`); units never break,
 * so the width check uses the whole unit. Only a unit longer than the line can overflow.
 */
function fill(tokens: Token[], indent: string, ctx: Ctx): string {
  const lines: string[] = [];
  let line = indent;
  let col = indent.length;
  // A line may break only where a space is both present and semantically neutral: never before closing
  // punctuation or after opening punctuation (the transform rule would turn that break into a glue).
  const breakable = (k: number) => {
    const t = tokens[k]!;
    if (t.glueBefore) return false;
    const prev = tokens[k - 1]!;
    return (
      !ctx.closing.includes(t.text[0]!) &&
      !ctx.opening.includes(prev.text[prev.text.length - 1]!)
    );
  };
  let i = 0;
  while (i < tokens.length) {
    let j = i + 1;
    while (j < tokens.length && !breakable(j)) j++;
    const unit = tokens
      .slice(i, j)
      .map((t, k) => (k > 0 && !t.glueBefore ? ' ' : '') + t.text)
      .join('');
    const nl = unit.indexOf('\n');
    const firstLine = nl === -1 ? unit : unit.slice(0, nl);
    if (line === indent) {
      line += unit;
    } else if (col + 1 + firstLine.length <= ctx.width) {
      line += ' ' + unit;
    } else {
      lines.push(ctx.transform ? line : line + "{' '}");
      line = indent + unit;
    }
    const lastNl = unit.lastIndexOf('\n');
    col =
      lastNl === -1
        ? line.length - (line.lastIndexOf('\n') + 1)
        : unit.length - lastNl - 1;
    i = j;
  }
  lines.push(line);
  return lines.join('\n');
}
