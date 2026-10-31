import type { ResolveFn } from './corpus-index.js';
import { compilePattern, type CompiledPattern } from './pattern.js';
import type { PropsInput, PropsOf } from './standard.js';
import type { AnyTag } from './tag.js';
import type { AnyNode, ChildNodes, Node } from './node.js';
import type { Severity } from './diagnostics.js';

export type Kind = 'block' | 'inline';

/** `none`: never gets an id · `optional`: gets an id, `$` optional · `required`: `$` is mandatory. */
export type RefMode = 'none' | 'optional' | 'required';

export type TagList = readonly AnyTag[];
export type LazyTagList = () => readonly AnyTag[];

/** What kind of children a tag accepts. */
export type ChildrenOf = Kind | 'any' | TagList | LazyTagList;

/** Children rule object form: constrain types plus arity and a content-model pattern. */
export interface ChildrenRule {
  readonly of?: ChildrenOf;
  /** Minimum number of children (default 1, or 0 when `of` is omitted and a pattern allows empty). */
  readonly min?: number;
  /** Maximum number of children (default unlimited). */
  readonly max?: number;
  /** DTD-like content model over child type names, see `pattern.ts`. */
  readonly pattern?: string;
  /**
   * Occurrence limits per child type, in any order: `{ caption: [0, 1], body: 1 }`.
   * A number means "exactly", a pair `[min, max]` a range (`max` may be `Infinity`). Types not listed are unlimited.
   * The order-free complement of `pattern` (which is a sequence).
   */
  readonly counts?: Readonly<Record<string, number | readonly [number, number]>>;
  /**
   * `'preserve'`: keep text children exactly as written (no whitespace collapsing or trimming), for verbatim
   * content such as diagram sources or code. Default `'normalize'`.
   */
  readonly whitespace?: 'normalize' | 'preserve';
}

export type ChildrenSpec = 'none' | ChildrenOf | ChildrenRule;

/** Report a problem from a definition callback; it lands in `node.diagnostics` (with the element's position). */
export type ReportFn = (code: string, message: string, severity?: Severity) => void;

export interface DataContext<P extends PropsInput, C extends ChildrenSpec> {
  readonly props: PropsOf<P>;
  readonly children: ChildNodes<C>;
  /** Report a problem instead of throwing: `report('figure/two-captions', 'Only one <Caption> is allowed')`. */
  readonly report: ReportFn;
  /** Scratch object shared with `normalize` for this element (e.g. extra results of generating the children). */
  readonly state: Record<string, unknown>;
}

/**
 * Context of a definition's `normalize`: rewrite the children before they are validated
 * (wrap loose content into a part, take generated content from a prop, reorder, …).
 */
export interface NormalizeContext<P extends PropsInput> {
  readonly props: PropsOf<P>;
  /** Children after flattening, whitespace normalization and the kit's paragraph autowrap. */
  readonly children: readonly AnyNode[];
  readonly report: ReportFn;
  /** Scratch object shared with `data` for this element. */
  readonly state: Record<string, unknown>;
}

/** Return the new children: nodes, strings, arrays or JSX (flattened again), or `undefined` for none. */
export type NormalizeFn<P extends PropsInput> = (ctx: NormalizeContext<P>) => unknown;

export interface DeriveContext {
  /** Opaque integrator context passed to `compile({ context })`. */
  readonly context: unknown;
  readonly signal?: AbortSignal | undefined;
  /** Resolve a reference against the corpus index, when the integrator provides one (`compile({ resolve })`, `deriveJSON({ resolve })`). */
  readonly resolve?: ResolveFn | undefined;
}

/** Runtime shape shared by every tag definition. */
export interface BaseDef {
  readonly name: string;
  readonly kind: Kind;
  readonly props: PropsInput;
  readonly children: ChildrenSpec;
  readonly ref: RefMode;
  readonly data?: ((ctx: any) => unknown) | undefined;
  /** Rewrite children before validation (see {@link NormalizeContext}). */
  readonly normalize?: ((ctx: any) => unknown) | undefined;
  /** Human readable base for the element id (slugified by `compile`). */
  readonly key?: ((node: any) => string | undefined) | undefined;
  /** Async derived data, computed in the `derive` phase of `compile`. */
  readonly derive?: ((node: any, ctx: DeriveContext) => unknown) | undefined;
  /** Opt out of kit common props: `{ toc: false }`. */
  readonly common?: Readonly<Record<string, false>> | undefined;
  /**
   * Props that are validated and passed to `normalize`/`data` but not stored on the node (`node.props`, JSON):
   * live objects such as a generator instance that only shape the children.
   */
  readonly transient?: readonly string[] | undefined;
}

export type OptOut = Readonly<Record<string, false>>;

export interface Def<
  Name extends string,
  K extends Kind,
  P extends PropsInput,
  C extends ChildrenSpec,
  R extends RefMode,
  D,
  V = undefined,
  O extends OptOut = {},
> extends BaseDef {
  readonly name: Name;
  readonly kind: K;
  readonly props: P;
  readonly children: C;
  readonly ref: R;
  readonly data?: ((ctx: DataContext<P, C>) => D) | undefined;
  readonly normalize?: NormalizeFn<P> | undefined;
  readonly key?: ((node: Node<Def<Name, K, P, C, R, D>>) => string | undefined) | undefined;
  readonly derive?: ((node: Node<Def<Name, K, P, C, R, D>>, ctx: DeriveContext) => V | Promise<V>) | undefined;
  readonly common?: O | undefined;
}

export type BlockDef<
  Name extends string,
  P extends PropsInput = {},
  C extends ChildrenSpec = 'none',
  R extends RefMode = 'none',
  D = undefined,
  V = undefined,
  O extends OptOut = {},
> = Def<Name, 'block', P, C, R, D, V, O>;

export type InlineDef<
  Name extends string,
  P extends PropsInput = {},
  C extends ChildrenSpec = 'none',
  R extends RefMode = 'none',
  D = undefined,
  V = undefined,
  O extends OptOut = {},
> = Def<Name, 'inline', P, C, R, D, V, O>;

//
// Runtime resolution of children rules
//

export type ChildrenContext = 'none' | 'inline' | 'block' | 'mixed';

export interface ResolvedChildrenRule {
  readonly mode: 'none' | 'kind' | 'tags' | 'any';
  readonly kind?: Kind;
  /** type name → tag, for `mode: 'tags'` */
  readonly tags?: ReadonlyMap<string, AnyTag>;
  readonly min: number;
  readonly max: number;
  readonly pattern?: CompiledPattern;
  /** type name → [min, max] */
  readonly counts?: ReadonlyMap<string, readonly [number, number]>;
  readonly preserveWhitespace?: boolean;
  readonly context: ChildrenContext;
}

const ruleCache = new WeakMap<BaseDef, ResolvedChildrenRule>();

export function isChildrenRule(spec: ChildrenSpec): spec is ChildrenRule {
  return typeof spec === 'object' && spec !== null && !Array.isArray(spec);
}

/** Resolve (and cache) the runtime children rule of a definition. Lazy tag lists are called once. */
export function resolveChildrenRule(def: BaseDef): ResolvedChildrenRule {
  const cached = ruleCache.get(def);
  if (cached) return cached;

  const spec = def.children;
  let of: ChildrenOf | undefined;
  let min: number | undefined;
  let max: number | undefined;
  let pattern: CompiledPattern | undefined;
  let counts: Map<string, readonly [number, number]> | undefined;

  if (spec === 'none') {
    const rule: ResolvedChildrenRule = { mode: 'none', min: 0, max: 0, context: 'none' };
    ruleCache.set(def, rule);
    return rule;
  }
  if (isChildrenRule(spec)) {
    of = spec.of;
    min = spec.min;
    max = spec.max;
    if (spec.pattern) pattern = compilePattern(spec.pattern);
    if (spec.counts) {
      counts = new Map();
      for (const [type, limit] of Object.entries(spec.counts)) {
        const range: readonly [number, number] = typeof limit === 'number' ? [limit, limit] : [limit[0], limit[1]];
        if (!(range[0] >= 0) || !(range[1] >= range[0])) {
          throw new RangeError(`<${def.name}> children counts for "${type}" must be 0 ≤ min ≤ max, got ${JSON.stringify(limit)}`);
        }
        counts.set(type, range);
      }
    }
  } else {
    of = spec;
  }

  let rule: ResolvedChildrenRule;
  const arity = { min: min ?? (pattern ? 0 : 1), max: max ?? Number.POSITIVE_INFINITY };

  if (of === undefined || of === 'any') {
    rule = { mode: 'any', ...arity, pattern, context: 'mixed' };
  } else if (of === 'block' || of === 'inline') {
    rule = { mode: 'kind', kind: of, ...arity, pattern, context: of };
  } else {
    const list = typeof of === 'function' ? of() : of;
    const tags = new Map<string, AnyTag>();
    let hasBlock = false;
    let hasInline = false;
    for (const tag of list) {
      tags.set(tag.def.name, tag);
      if (tag.def.kind === 'block') hasBlock = true;
      else hasInline = true;
    }
    const context: ChildrenContext = hasBlock && hasInline ? 'mixed' : hasBlock ? 'block' : 'inline';
    rule = { mode: 'tags', tags, ...arity, pattern, context };
  }

  if (isChildrenRule(spec) && spec.whitespace === 'preserve') rule = { ...rule, preserveWhitespace: true };

  if (counts) {
    rule = { ...rule, counts };
    const known = rule.tags ? new Set(rule.tags.keys()) : undefined;
    for (const type of counts.keys()) {
      if (known && !known.has(type)) {
        throw new SyntaxError(`<${def.name}> children counts mention "${type}" which is not in its children list`);
      }
    }
  }

  if (pattern) {
    const known = rule.tags ? new Set(rule.tags.keys()) : undefined;
    if (known) {
      for (const name of pattern.names) {
        if (!known.has(name)) {
          throw new SyntaxError(
            `<${def.name}> children pattern "${pattern.source}" mentions "${name}" which is not in its children list`,
          );
        }
      }
    }
  }

  ruleCache.set(def, rule);
  return rule;
}
