import type { BaseDef, ResolvedChildrenRule } from './def.js';
import { DiagnosticBag, type SourcePos } from './diagnostics.js';
import { wrapperOf, type KitRuntime } from './kit.js';
import {
  isAnyNode,
  isBaseNode,
  isFragmentNode,
  isTextNode,
  makeTextNode,
  type AnyNode,
  type BaseNode,
  type TextNode,
} from './node.js';
import { errorMessage } from './util.js';

/**
 * Paragraph separator (U+2029). Loose inline content inside a block-only container is split into
 * one autowrapped paragraph per segment ("blank line = new paragraph", as in TeX and Markdown).
 * `@tsprose/transform` emits it for blank lines when its `paragraphs` option is on; anywhere else
 * (inline context, mixed context) it is plain whitespace.
 */
export const PARAGRAPH_SEPARATOR = '\u2029';

const WS_RUN = /[ \t\r\n\f\u2029]+/g;
const WS_ONLY = /^[ \t\r\n\f\u2029]*$/;

/**
 * Flatten raw JSX children into nodes: arrays and fragments are spread, `null`/`undefined`/booleans
 * are dropped, strings and numbers become text, adjacent texts are merged. No whitespace
 * normalization here (that depends on the parent's children context).
 */
export function flattenChildren(raw: unknown, bag?: DiagnosticBag, pos?: SourcePos): AnyNode[] {
  const out: AnyNode[] = [];
  const push = (node: AnyNode) => {
    const last = out[out.length - 1];
    if (isTextNode(node) && last && isTextNode(last)) {
      last.text += node.text;
    } else {
      out.push(node);
    }
  };
  const visit = (value: unknown): void => {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (value !== '') push(makeTextNode(value));
      return;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      push(makeTextNode(String(value)));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (isFragmentNode(value)) {
      if (value.diagnostics?.length) {
        // keep fragment-level diagnostics (e.g. invalid tag) by lifting them to the parent
        bag?.items.push(...value.diagnostics);
      }
      for (const child of value.children ?? []) visit(child);
      return;
    }
    if (isAnyNode(value)) {
      push(isTextNode(value) ? makeTextNode(value.text, value.pos) : value);
      return;
    }
    bag?.error(
      'children/invalid',
      `Unsupported child value (${describeValue(value)}). Children must be elements, strings or numbers.`,
      pos,
    );
  };
  visit(raw);
  return out;
}

function describeValue(value: unknown): string {
  if (typeof value === 'function') return `function ${(value as { name?: string }).name || '(anonymous)'}`;
  if (typeof value === 'object' && value !== null) {
    const v = value as { type?: unknown; name?: unknown };
    if (typeof v.name === 'string' && 'def' in v) return `ref "${v.name}"`;
    return 'object';
  }
  return typeof value;
}

function collapse(text: string): string {
  return text.replace(WS_RUN, ' ');
}

function isWhitespaceOnly(node: AnyNode): node is TextNode {
  return isTextNode(node) && WS_ONLY.test(node.text);
}

function mergeTexts(nodes: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (isTextNode(node) && last && isTextNode(last)) last.text += node.text;
    else out.push(node);
  }
  return out.filter((n) => !(isTextNode(n) && n.text === ''));
}

/**
 * Normalize whitespace for a children context.
 * - inline: collapse runs, trim at both edges of the sequence.
 * - block: drop whitespace-only texts (other texts stay for autowrap / diagnostics).
 * - mixed: collapse, drop whitespace texts touching block nodes or edges, trim around blocks.
 */
export function normalizeWhitespace(nodes: AnyNode[], context: 'inline' | 'block' | 'mixed'): AnyNode[] {
  if (nodes.length === 0) return nodes;
  if (context === 'block') {
    // Paragraph separators survive: the autowrap splits loose inline runs on them.
    return nodes.filter((n) => !isWhitespaceOnly(n) || n.text.includes(PARAGRAPH_SEPARATOR));
  }
  let out = nodes.map((n) => (isTextNode(n) ? makeTextNode(collapse(n.text), n.pos) : n));
  if (context === 'mixed') {
    const isBlock = (n: AnyNode | undefined) => !!n && isBaseNode(n) && n.kind === 'block';
    out = out.filter((n, i) => {
      if (!isWhitespaceOnly(n)) return true;
      return !(i === 0 || i === out.length - 1 || isBlock(out[i - 1]) || isBlock(out[i + 1]));
    });
    out = out.map((n, i) => {
      if (!isTextNode(n)) return n;
      let text = n.text;
      if (i === 0 || isBlock(out[i - 1])) text = text.replace(/^ /, '');
      if (i === out.length - 1 || isBlock(out[i + 1])) text = text.replace(/ $/, '');
      return makeTextNode(text, n.pos);
    });
    return mergeTexts(out);
  }
  // inline
  const first = out[0];
  if (first && isTextNode(first)) out[0] = makeTextNode(first.text.replace(/^ /, ''), first.pos);
  const lastIndex = out.length - 1;
  const last = out[lastIndex];
  if (last && isTextNode(last)) out[lastIndex] = makeTextNode(last.text.replace(/ $/, ''), last.pos);
  return mergeTexts(out);
}

export interface BuildChildrenArgs {
  readonly raw: unknown;
  readonly rule: ResolvedChildrenRule;
  readonly def: BaseDef;
  readonly kit: KitRuntime | undefined;
  readonly bag: DiagnosticBag;
  readonly pos: SourcePos | undefined;
  /** Validated own props (passed to the definition's `normalize`). */
  readonly props?: Readonly<Record<string, unknown>> | undefined;
  readonly report?: ((code: string, message: string, severity?: 'error' | 'warning') => void) | undefined;
  readonly state?: Record<string, unknown> | undefined;
}

/** Full children pipeline for a tag call: flatten → whitespace → autowrap → validate. */
export function buildChildren(args: BuildChildrenArgs): AnyNode[] | undefined {
  const { rule, def, kit, bag, pos } = args;
  const tagName = `<${def.name}>`;
  let nodes = flattenChildren(args.raw, bag, pos);

  if (rule.mode === 'none') {
    if (nodes.length > 0) {
      bag.error('children/forbidden', `${tagName} does not accept children`, pos);
    }
    return undefined;
  }

  if (!rule.preserveWhitespace) nodes = normalizeWhitespace(nodes, rule.context === 'none' ? 'mixed' : rule.context);

  // Loose inline content inside a block-only container: wrap or report.
  if (rule.context === 'block') {
    nodes = wrapLooseInline(nodes, rule, def, kit, bag, pos);
  }

  // Definition hook: rewrite children before validation
  if (def.normalize) {
    try {
      const rewritten = def.normalize({
        props: args.props ?? {},
        children: nodes,
        report: args.report ?? ((code: string, message: string) => bag.error(code, message, pos)),
        state: args.state ?? {},
      });
      nodes = rewritten === nodes ? nodes : flattenChildren(rewritten, bag, pos);
    } catch (error) {
      bag.error('tag/normalize', `${tagName} normalize() threw: ${errorMessage(error)}`, pos);
    }
  }

  // Paragraph separators kept for normalize (see wrapLooseInline) are not content.
  if (rule.context === 'block') nodes = nodes.filter((n) => !isWhitespaceOnly(n));

  // Kind / type validation
  for (const child of nodes) {
    if (rule.mode === 'kind') {
      if (child.kind !== rule.kind) {
        bag.error(
          'children/kind',
          `${tagName} accepts only ${rule.kind} children, received ${describeNode(child)}`,
          childPos(child, pos),
        );
      }
    } else if (rule.mode === 'tags') {
      if (!rule.tags!.has(child.type)) {
        bag.error(
          'children/type',
          `${tagName} cannot contain ${describeNode(child)}; allowed: ${[...rule.tags!.keys()].map((t) => `<${t}>`).join(', ')}`,
          childPos(child, pos),
        );
      }
    }
  }

  // Arity
  if (nodes.length < rule.min) {
    bag.error(
      'children/arity',
      rule.min === 1 && nodes.length === 0
        ? `${tagName} requires children`
        : `${tagName} requires at least ${rule.min} children, received ${nodes.length}`,
      pos,
    );
  } else if (nodes.length > rule.max) {
    bag.error('children/arity', `${tagName} accepts at most ${rule.max} children, received ${nodes.length}`, pos);
  }

  // Occurrence counts (order-free)
  if (rule.counts) {
    const seen = new Map<string, number>();
    for (const child of nodes) seen.set(child.type, (seen.get(child.type) ?? 0) + 1);
    for (const [type, [min, max]] of rule.counts) {
      const n = seen.get(type) ?? 0;
      if (n < min || n > max) {
        const expected = min === max ? `exactly ${min}` : max === Number.POSITIVE_INFINITY ? `at least ${min}` : min === 0 ? `at most ${max}` : `${min} to ${max}`;
        bag.error('children/count', `${tagName} requires ${expected} <${type}>, received ${n}`, pos);
      }
    }
  }

  // Content model
  if (rule.pattern && !rule.pattern.test(nodes.map((n) => n.type))) {
    bag.error(
      'children/pattern',
      `${tagName} children must match "${rule.pattern.source}", received ${nodes.map((n) => n.type).join(' ') || '(nothing)'}`,
      pos,
    );
  }

  return nodes.length > 0 ? nodes : undefined;
}

function wrapLooseInline(
  nodes: AnyNode[],
  rule: ResolvedChildrenRule,
  def: BaseDef,
  kit: KitRuntime | undefined,
  bag: DiagnosticBag,
  pos: SourcePos | undefined,
): AnyNode[] {
  const wrapper = wrapperOf(kit);
  const out: AnyNode[] = [];
  let run: AnyNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (wrapper && (rule.mode !== 'tags' || rule.tags!.has(wrapper.def.name))) {
      const trimmed = normalizeWhitespace(run, 'inline');
      if (trimmed.length > 0) {
        out.push(wrapper({ children: trimmed }, { pos: run[0]!.pos ?? pos }) as BaseNode);
      }
    } else {
      // No applicable wrapper: leave the nodes in place, the kind/type checks report each of them.
      out.push(...run);
    }
    run = [];
  };
  const applicable = !!wrapper && (rule.mode !== 'tags' || rule.tags!.has(wrapper.def.name));
  let previousWasRun = false;
  for (const segment of segmentLooseInline(nodes)) {
    if (segment.block) {
      out.push(segment.block);
      previousWasRun = false;
    } else {
      // Without an applicable wrapper the runs stay loose; keep the paragraph break between consecutive runs
      // so a definition's normalize can still wrap them paragraph by paragraph.
      if (!applicable && previousWasRun) out.push(makeTextNode(PARAGRAPH_SEPARATOR));
      run = segment.inline;
      flush();
      previousWasRun = true;
    }
  }
  return out;
}

export type LooseSegment = { readonly block: AnyNode; readonly inline?: undefined } | { readonly block?: undefined; readonly inline: AnyNode[] };

/**
 * Split children of a block container into block nodes and runs of loose inline content.
 * A paragraph separator (U+2029) inside text ends the current run, so each paragraph of loose
 * text becomes its own run (empty runs are dropped). Used by the kit autowrap and by `compile`
 * for the document root.
 */
export function segmentLooseInline(nodes: readonly AnyNode[]): LooseSegment[] {
  const out: LooseSegment[] = [];
  let run: AnyNode[] = [];
  const flush = () => {
    if (run.some((n) => !isWhitespaceOnly(n))) out.push({ inline: run });
    run = [];
  };
  for (const node of nodes) {
    if (node.kind !== 'inline') {
      flush();
      out.push({ block: node });
    } else if (isTextNode(node) && node.text.includes(PARAGRAPH_SEPARATOR)) {
      node.text.split(PARAGRAPH_SEPARATOR).forEach((part, i) => {
        if (i > 0) flush();
        if (part) run.push(makeTextNode(part, node.pos));
      });
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

function childPos(child: AnyNode, fallback: SourcePos | undefined): SourcePos | undefined {
  return child.pos ?? fallback;
}

export function describeNode(node: AnyNode): string {
  if (isTextNode(node)) {
    const preview = node.text.length > 24 ? `${node.text.slice(0, 21)}…` : node.text;
    return `text "${preview}"`;
  }
  return `<${node.type}>`;
}
