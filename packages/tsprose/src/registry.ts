import type { BaseDef, ChildrenSpec } from './def.js';
import type { BaseNode, Node, NodeOf, TextNode } from './node.js';
import type { AnyTag } from './tag.js';

/**
 * Global tag registry — augment it to turn `ProseNode` into a discriminated union:
 *
 * ```ts
 * declare module 'tsprose' {
 *   interface Registry { paragraph: typeof P; theorem: typeof Theorem }
 * }
 * ```
 *
 * Prefer `createProse({ tags })` for multi-corpus setups and tests; the registry is sugar over it.
 */
export interface Registry {}

export type HasRegistry = keyof Registry extends never ? false : true;
export type RegistryTags = Registry[keyof Registry];

type Kinded<N, K> = N extends { readonly kind: K } ? N : never;

type RegisteredChildren<C extends ChildrenSpec, Tags> = C extends 'none'
  ? undefined
  : C extends 'block'
    ? Kinded<RegisteredNodes<Tags>, 'block'>[]
    : C extends 'inline'
      ? (Kinded<RegisteredNodes<Tags>, 'inline'> | TextNode)[]
      : C extends 'any'
        ? (RegisteredNodes<Tags> | TextNode)[]
        : C extends readonly (infer T)[]
          ? RegisteredIn<NodeOf<T>, Tags>[]
          : C extends () => readonly (infer T)[]
            ? RegisteredIn<NodeOf<T>, Tags>[]
            : C extends { readonly of: infer O extends ChildrenSpec }
              ? RegisteredChildren<O, Tags>
              : (RegisteredNodes<Tags> | TextNode)[];

/** A node whose kind-based children (`'block'`/`'inline'`) are resolved against the tag union `Tags`. */
export type RegisteredIn<N, Tags> =
  N extends Node<infer D, infer M>
    ? Omit<Node<D, M>, 'children'> & {
        children: RegisteredChildren<D['children'], Tags>;
      }
    : never;

/** Union of all registered element nodes (without text). */
export type RegisteredNodes<Tags> = RegisteredIn<NodeOf<Tags>, Tags>;

/** Element union for an explicit tag list. */
export type ProseNodeOf<Tags extends readonly AnyTag[]> =
  RegisteredNodes<Tags[number]> | TextNode;

/** Element union for the global {@link Registry}; falls back to `BaseNode | TextNode` when nothing is registered. */
export type ProseNode = HasRegistry extends true
  ? RegisteredNodes<RegistryTags> | TextNode
  : BaseNode | TextNode;

/** Registered node for one tag (children resolved through the global registry). */
export type Registered<T extends AnyTag> = HasRegistry extends true
  ? RegisteredIn<NodeOf<T>, RegistryTags>
  : NodeOf<T>;

/** Map a tag list to a registry-shaped interface: `interface Registry extends TagsToRegistry<typeof tags> {}`. */
export type TagsToRegistry<Tags extends readonly AnyTag[]> = {
  [T in Tags[number] as T['def']['name']]: T;
};

/** Explicit, registry-free prose instance. */
export interface Prose<Tags extends readonly AnyTag[]> {
  readonly tags: Tags;
  readonly byName: ReadonlyMap<string, Tags[number]>;
  /** Type-only carrier: `type N = typeof prose.Node`. */
  readonly Node: ProseNodeOf<Tags>;
  has(name: string): boolean;
}

/** A registry-free prose instance over an explicit tag list (typed node union, lookup by name for `fromJSON`). */
export function createProse<const Tags extends readonly AnyTag[]>(options: {
  readonly tags: Tags;
}): Prose<Tags> {
  const byName = new Map<string, Tags[number]>();
  for (const tag of options.tags) {
    const existing = byName.get(tag.def.name);
    if (existing && existing.def !== tag.def) {
      throw new TypeError(
        `createProse: two different tags share the name "${tag.def.name}"`,
      );
    }
    byName.set(tag.def.name, tag);
  }
  return {
    tags: options.tags,
    byName,
    Node: undefined as unknown as ProseNodeOf<Tags>,
    has: (name) => byName.has(name),
  };
}
