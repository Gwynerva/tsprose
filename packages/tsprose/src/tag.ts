import {
  isChildrenRule,
  type BaseDef,
  type ChildrenSpec,
  type DataContext,
  type NormalizeFn,
  type Def,
  type DeriveContext,
  type Kind,
  type OptOut,
  type RefMode,
} from './def.js';
import { instantiate, type TagCallContext } from './element.js';
import type { KitRuntime } from './kit.js';
import type { Node } from './node.js';
import type { Ref, RefTarget } from './ref.js';
import type { DistributiveOmit, InferProps, PropsInput, PropsOf, PropsSpec } from './standard.js';

export const TAG: unique symbol = Symbol.for('tsprose.tag');

/** Least common denominator of every tag. Call signature returns `unknown` on purpose (variance + perf). */
export interface AnyTag {
  (props: any, ctx?: TagCallContext): unknown;
  readonly def: BaseDef;
  readonly [TAG]: true;
  readonly kit: KitRuntime | undefined;
  readonly preset: Readonly<Record<string, unknown>> | undefined;
}

export type InlineTag = AnyTag & { readonly def: { readonly kind: 'inline' } };

type ChildrenProp<C extends ChildrenSpec> = C extends 'none'
  ? {
      /** This tag takes no children. */
      children?: never;
    }
  : C extends { readonly min: 0 }
    ? {
        /** Content of the element (optional). */
        children?: {} | null | undefined;
      }
    : {
        /** Content of the element (required). */
        children: {};
      };

type RefProp<D extends BaseDef> = D['ref'] extends 'none'
  ? {
      /** This tag is not referable (`ref: 'none'`). */
      $?: never;
    }
  : D['ref'] extends 'required'
    ? {
        /** Reference handle from `defineRefs` (or a string id). Required: other documents link to this element. */
        $: Ref<D> | RefTarget | string;
      }
    : {
        /** Optional reference handle from `defineRefs` (or a string id) so other documents can link here. */
        $?: Ref<D> | RefTarget | string;
      };

/** Props accepted by a tag in JSX and in direct calls. `X` = kit common props, `Preset` = keys fixed by `.with()`. */
export type TagProps<D extends BaseDef, X = {}, Preset extends PropertyKey = never> = ([Preset] extends [never]
  ? PropsOf<D['props']>
  : DistributiveOmit<PropsOf<D['props']>, Preset>) &
  ChildrenProp<D['children']> &
  RefProp<D> &
  X;

export interface Tag<D extends BaseDef = BaseDef, X = {}, M = {}, Preset extends PropertyKey = never> {
  (props: TagProps<D, X, Preset>): Node<D, M>;
  readonly def: D;
  readonly [TAG]: true;
  readonly kit: KitRuntime | undefined;
  readonly preset: Readonly<Record<string, unknown>> | undefined;
  /** Phantom: kit meta type. */
  readonly __meta?: M;
  /** Phantom: kit common props type. */
  readonly __extra?: X;
  /** Create a variant with some props fixed: `const H1 = Heading.with({ level: 1 })`. */
  with<K extends Exclude<keyof PropsOf<D['props']>, Preset>>(
    preset: Pick<PropsOf<D['props']>, K>,
  ): Tag<D, X, M, Preset | K>;
  /** Human readable base for the element id (slugified by `compile`): `Image.key((n) => n.props.src)`. */
  key(fn: (node: Node<D, M>) => string | undefined): Tag<D, X, M, Preset>;
  /** Async derived data, computed in the `derive` phase of `compile` (overridable per compile). */
  derive<V>(fn: (node: Node<D, M>, ctx: DeriveContext) => V | Promise<V>): Tag<WithDerive<D, V>, X, M, Preset>;
  /**
   * A tagged template for raw-text tags (math, code, diagrams): the template text becomes the single text child,
   * backslashes and braces are kept verbatim (like `String.raw`). `const m = M.template()` →
   * `{m\`\\frac{a}{b}\`}`, with props: `{m({ currentColor: true })\`x\`}`.
   * The template carries the tag's `def`, so tooling knows whether it produces an inline or a block node.
   */
  template(): TextTemplate<DistributiveOmit<TagProps<D, X, Preset>, 'children'>, Node<D, M>, D>;
}

export const TEMPLATE: unique symbol = Symbol.for('tsprose.template');

/** See {@link Tag.template}. */
export interface TextTemplate<P, N, D extends BaseDef = BaseDef> {
  (strings: TemplateStringsArray, ...values: unknown[]): N;
  (props: P): (strings: TemplateStringsArray, ...values: unknown[]) => N;
  readonly def: D;
  readonly [TEMPLATE]: true;
}

export function isTextTemplate(value: unknown): value is TextTemplate<unknown, unknown> {
  return typeof value === 'function' && (value as TextTemplate<unknown, unknown>)[TEMPLATE] === true;
}

function isTemplateStrings(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && 'raw' in value;
}

function rawText(strings: TemplateStringsArray, values: readonly unknown[]): string {
  return String.raw({ raw: strings.raw }, ...values.map((v) => String(v)));
}

function createTemplate(tag: AnyTag): TextTemplate<unknown, unknown> {
  const build = (props: Record<string, unknown>, text: string) => tag({ ...props, children: text });
  const template = ((first: unknown, ...values: unknown[]) => {
    if (isTemplateStrings(first)) return build({}, rawText(first, values));
    const props = (first ?? {}) as Record<string, unknown>;
    return (strings: TemplateStringsArray, ...rest: unknown[]) => build(props, rawText(strings, rest));
  }) as TextTemplate<unknown, unknown>;
  Object.defineProperty(template, 'def', { value: tag.def, enumerable: true });
  Object.defineProperty(template, 'tag', { value: tag, enumerable: false });
  Object.defineProperty(template, TEMPLATE, { value: true });
  return template;
}

/** The definition with its derive result type replaced. */
export type WithDerive<D extends BaseDef, V> = D extends Def<infer N, infer K, infer P, infer C, infer R, infer DD, any, infer O>
  ? Def<N, K, P, C, R, DD, V, O>
  : D;

export function isTag(value: unknown): value is AnyTag {
  return typeof value === 'function' && (value as AnyTag)[TAG] === true;
}

/** Explicit-definition input (used with an explicit type argument for recursive tags). */
export type DefInput<D extends BaseDef> = {
  readonly name: D['name'];
  readonly props?: D['props'];
  readonly children?: D['children'];
  readonly ref?: D['ref'];
  readonly data?: D['data'];
  readonly normalize?: D['normalize'];
  readonly transient?: D['transient'];
  readonly key?: D['key'];
  readonly derive?: D['derive'];
  readonly common?: D['common'];
};

/** Inferred-definition input. */
export type DefInputFor<
  Name extends string,
  K extends Kind,
  P extends PropsInput,
  C extends ChildrenSpec,
  R extends RefMode,
  D,
  O extends OptOut,
> = {
  readonly name: Name;
  readonly props?: P;
  readonly children?: C;
  readonly ref?: R;
  readonly data?: (ctx: DataContext<P, C>) => D;
  /** Rewrite children before validation: `normalize: ({ props, children }) => props.script ? props.script.content : children`. */
  readonly normalize?: NormalizeFn<P>;
  /** Props validated and passed to `normalize`/`data` but not stored on the node: `transient: ['script']`. */
  readonly transient?: readonly (keyof PropsOf<P> & string)[];
  readonly common?: O;
};

/**
 * Definer signatures. `XOf` and `MOf` are computed by kits; the core definers use `{}`.
 * The explicit overload comes first with `= never` so it is only picked with a type argument.
 */
export interface BlockDefiner<A extends PropsSpec = {}, R extends PropsSpec = {}, N extends PropsSpec = {}> {
  <D extends BaseDef & { readonly kind: 'block' } = never>(def: DefInput<D>): Tag<D, CommonProps<D, A, R>, KitMeta<A, R, N>>;
  <
    const Name extends string,
    const P extends PropsInput = {},
    const C extends ChildrenSpec = 'none',
    const RM extends RefMode = 'none',
    D = undefined,
    const O extends OptOut = {},
  >(
    def: DefInputFor<Name, 'block', P, C, RM, D, O>,
  ): Tag<Def<Name, 'block', P, C, RM, D, undefined, O>, CommonProps<Def<Name, 'block', P, C, RM, D, undefined, O>, A, R>, KitMeta<A, R, N>>;
}

export type InlineChildrenSpec =
  | 'none'
  | 'inline'
  | readonly InlineTag[]
  | (() => readonly InlineTag[])
  | {
      readonly of?: 'inline' | readonly InlineTag[] | (() => readonly InlineTag[]);
      readonly min?: number;
      readonly max?: number;
      readonly pattern?: string;
      readonly counts?: Readonly<Record<string, number | readonly [number, number]>>;
      readonly whitespace?: 'normalize' | 'preserve';
    };

export interface InlineDefiner<A extends PropsSpec = {}, R extends PropsSpec = {}, N extends PropsSpec = {}> {
  <D extends BaseDef & { readonly kind: 'inline' } = never>(def: DefInput<D>): Tag<D, CommonProps<D, A, R>, KitMeta<A, R, N>>;
  <
    const Name extends string,
    const P extends PropsInput = {},
    const C extends InlineChildrenSpec = 'none',
    const RM extends RefMode = 'none',
    D = undefined,
    const O extends OptOut = {},
  >(
    def: DefInputFor<Name, 'inline', P, C, RM, D, O>,
  ): Tag<Def<Name, 'inline', P, C, RM, D, undefined, O>, CommonProps<Def<Name, 'inline', P, C, RM, D, undefined, O>, A, R>, KitMeta<A, R, N>>;
}

/** Kit common props for a definition: `always` ones plus `refable` ones when `ref !== 'none'`, minus opt-outs. */
export type CommonProps<D extends BaseDef, A extends PropsSpec, R extends PropsSpec> = Omit<
  InferProps<A> & (D['ref'] extends 'none' ? {} : InferProps<R>),
  OptedOut<D>
>;

type OptedOut<D extends BaseDef> = D extends { readonly common?: infer O } ? keyof NonNullable<O> : never;

export type KitMeta<A extends PropsSpec, R extends PropsSpec, N extends PropsSpec> = Partial<
  InferProps<A> & InferProps<R> & InferProps<N>
>;

//
// Runtime
//

export function createTag(def: BaseDef, kit: KitRuntime | undefined, preset?: Record<string, unknown>): AnyTag {
  const tag = ((props: Record<string, unknown> = {}, ctx?: TagCallContext) =>
    instantiate(tag, props, ctx)) as unknown as AnyTag;
  Object.defineProperty(tag, 'name', { value: def.name, configurable: true });
  Object.defineProperty(tag, TAG, { value: true });
  Object.defineProperty(tag, 'def', { value: def, enumerable: true });
  Object.defineProperty(tag, 'kit', { value: kit, enumerable: false });
  Object.defineProperty(tag, 'preset', { value: preset, enumerable: false });
  Object.defineProperty(tag, 'with', {
    value: (more: Record<string, unknown>) => createTag(def, kit, { ...preset, ...more }),
    enumerable: false,
  });
  Object.defineProperty(tag, 'key', {
    value: (fn: BaseDef['key']) => createTag({ ...def, key: fn }, kit, preset),
    enumerable: false,
  });
  Object.defineProperty(tag, 'derive', {
    value: (fn: BaseDef['derive']) => createTag({ ...def, derive: fn }, kit, preset),
    enumerable: false,
  });
  Object.defineProperty(tag, 'template', {
    value: () => createTemplate(tag),
    enumerable: false,
  });
  return tag;
}

const NAME_RE = /^[A-Za-z_][\w.-]*$/;

export function normalizeDef(input: Record<string, unknown>, kind: Kind): BaseDef {
  const name = input.name;
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new TypeError(`Invalid tag name ${JSON.stringify(name)}: use letters, digits, "_", "-", "."`);
  }
  if (name === 'text' || name === 'fragment' || name === 'root') {
    throw new TypeError(`Tag name "${name}" is reserved`);
  }
  const children = (input.children ?? 'none') as ChildrenSpec;
  if (kind === 'inline') {
    const of = isChildrenRule(children) ? children.of : children;
    if (of === 'block' || of === 'any') {
      throw new TypeError(`Inline tag "${name}" cannot accept ${of} children`);
    }
  }
  return {
    name,
    kind,
    props: (input.props ?? {}) as PropsInput,
    children,
    ref: (input.ref ?? 'none') as RefMode,
    data: input.data as BaseDef['data'],
    normalize: input.normalize as BaseDef['normalize'],
    transient: input.transient as BaseDef['transient'],
    key: input.key as BaseDef['key'],
    derive: input.derive as BaseDef['derive'],
    common: input.common as BaseDef['common'],
  };
}

export function makeDefiners(kit: KitRuntime | undefined): { defineBlock: BlockDefiner; defineInline: InlineDefiner } {
  return {
    defineBlock: ((def: Record<string, unknown>) => createTag(normalizeDef(def, 'block'), kit)) as unknown as BlockDefiner,
    defineInline: ((def: Record<string, unknown>) => createTag(normalizeDef(def, 'inline'), kit)) as unknown as InlineDefiner,
  };
}

const core = makeDefiners(undefined);

/** Define a block-level tag. */
export const defineBlock: BlockDefiner = core.defineBlock;
/** Define an inline tag (children must be inline). */
export const defineInline: InlineDefiner = core.defineInline;
