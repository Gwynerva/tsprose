import type { BaseDef, ChildrenSpec, Kind } from './def.js';
import type { Diagnostic, SourcePos } from './diagnostics.js';
import type { PropsOf } from './standard.js';

/** Runtime shape of every element node (text nodes are {@link TextNode}). */
export interface BaseNode {
  readonly type: string;
  readonly kind: Kind;
  /** Validated own props (never contains `$`, `children` or kit common props). */
  props: Record<string, unknown>;
  /** Result of the definition's `data` function. */
  data: unknown;
  children: AnyNode[] | undefined;
  /** Ref name given via `$` (string or Ref handle). */
  ref: string | undefined;
  /** Kit-level data: validated common props and anything `onElement` added. */
  meta: Record<string, unknown>;
  pos?: SourcePos | undefined;
  /** Problems detected while creating this node. Collected by `compile`. */
  diagnostics?: Diagnostic[] | undefined;
  /** Stable element id, assigned by `compile` for nodes whose definition has `ref !== 'none'`. */
  id?: string | undefined;
  /** Key into the compile result `derived` map (set by the `derive` phase). */
  derived?: string | undefined;
}

export interface TextNode {
  readonly type: 'text';
  readonly kind: 'inline';
  text: string;
  pos?: SourcePos | undefined;
}

export type AnyNode = BaseNode | TextNode;
export type BlockNode = BaseNode & { readonly kind: 'block' };
export type InlineNode = (BaseNode & { readonly kind: 'inline' }) | TextNode;

/** Type name of fragment nodes produced by `<>…</>` and component arrays. Flattened into parents. */
export const FRAGMENT_TYPE = 'fragment';
export const TEXT_TYPE = 'text';

export function isTextNode(value: unknown): value is TextNode {
  return typeof value === 'object' && value !== null && (value as TextNode).type === TEXT_TYPE && 'text' in value;
}

export function isBaseNode(value: unknown): value is BaseNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BaseNode).type === 'string' &&
    (value as BaseNode).type !== TEXT_TYPE &&
    'props' in value &&
    'meta' in value
  );
}

export function isAnyNode(value: unknown): value is AnyNode {
  return isTextNode(value) || isBaseNode(value);
}

export function isFragmentNode(value: unknown): value is BaseNode & { readonly type: 'fragment' } {
  return isBaseNode(value) && value.type === FRAGMENT_TYPE;
}

export function makeTextNode(text: string, pos?: SourcePos): TextNode {
  return pos ? { type: TEXT_TYPE, kind: 'inline', text, pos } : { type: TEXT_TYPE, kind: 'inline', text };
}

//
// Typed nodes
//

/** Phantom carrier for `NodeOf`/`MetaOf`: concrete tags expose `def` and (for kits) `__meta`. */
export type DefOf<T> = T extends { readonly def: infer D extends BaseDef } ? D : never;
export type MetaOf<T> = T extends { readonly __meta?: infer M } ? (unknown extends M ? {} : NonNullable<M>) : {};

export type DataOf<D extends BaseDef> = D extends { readonly data?: ((ctx: any) => infer R) | undefined }
  ? unknown extends R
    ? undefined
    : R
  : undefined;

export type RefOf<D extends BaseDef> = D['ref'] extends 'none'
  ? undefined
  : D['ref'] extends 'required'
    ? string
    : string | undefined;

type NodesOfTags<T> = T extends readonly (infer Tag)[] ? NodeOf<Tag>[] : never;

/** Structural children type for a children spec. Never references the Registry (see `registry.ts`). */
export type ChildNodes<C extends ChildrenSpec> = C extends 'none'
  ? undefined
  : C extends 'block'
    ? BlockNode[]
    : C extends 'inline'
      ? InlineNode[]
      : C extends 'any'
        ? AnyNode[]
        : C extends readonly any[]
          ? NodesOfTags<C>
          : C extends () => infer L
            ? NodesOfTags<L>
            : C extends { readonly of: infer O extends ChildrenSpec }
              ? ChildNodes<O>
              : AnyNode[];

/**
 * Typed element node for a definition `D`. Structural: safe to use in `data` callbacks and
 * declaration emit; the registry-aware union is `ProseNode`.
 */
export interface Node<D extends BaseDef = BaseDef, M = {}> {
  readonly type: D['name'];
  readonly kind: D['kind'];
  props: PropsOf<D['props']>;
  data: DataOf<D>;
  children: ChildNodes<D['children']>;
  ref: RefOf<D>;
  meta: M & Record<string, unknown>;
  pos?: SourcePos | undefined;
  diagnostics?: Diagnostic[] | undefined;
  id?: string | undefined;
  derived?: string | undefined;
}

export type NodeOf<T> = T extends { readonly def: infer D extends BaseDef } ? Node<D, MetaOf<T>> : never;
