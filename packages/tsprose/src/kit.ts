import type { BaseDef } from './def.js';
import type { Severity } from './diagnostics.js';
import type { BaseNode } from './node.js';
import type { PropsSpec } from './standard.js';
import { createTag, makeDefiners, type AnyTag, type BlockDefiner, type InlineDefiner, type Tag } from './tag.js';

export interface ElementHookContext {
  readonly node: BaseNode;
  readonly def: BaseDef;
  readonly tag: AnyTag;
  /** Raw props as passed (including `$`, `children`, common props). */
  readonly props: Readonly<Record<string, unknown>>;
  report(code: string, message: string, severity?: Severity): void;
}

/** Runtime half of a kit, attached to every tag the kit defines. */
export interface KitRuntime {
  commonSpecFor(def: BaseDef): PropsSpec;
  readonly onElement?: ((ctx: ElementHookContext) => void) | undefined;
  /** Strip or rewrite kit meta on transcluded copies (`<Include of>`). */
  readonly onInclude?: ((node: BaseNode) => void) | undefined;
  /** Tag used to wrap loose inline content found directly inside block-only containers. */
  readonly wrapLooseInline?: AnyTag | (() => AnyTag) | undefined;
  /** Default id base for kit tags that define no `key` of their own (e.g. the title from meta). */
  readonly defaultKey?: ((node: BaseNode) => string | undefined) | undefined;
}

/** Resolve the (possibly lazy) autowrap tag of a kit. */
export function wrapperOf(kit: KitRuntime | undefined): AnyTag | undefined {
  const w = kit?.wrapLooseInline;
  if (!w) return undefined;
  return 'def' in w ? (w as AnyTag) : (w as () => AnyTag)();
}

export interface KitOptions<A extends PropsSpec = {}, R extends PropsSpec = {}, N extends PropsSpec = {}> {
  /** Common props added to every tag (`always`) and to referable tags only (`refable`). */
  readonly common?: { readonly always?: A; readonly refable?: R } | undefined;
  /** Extra typed meta fields the kit sets in `onElement` (type-level only). */
  readonly meta?: N | undefined;
  readonly onElement?: ((ctx: ElementHookContext) => void) | undefined;
  readonly onInclude?: ((node: BaseNode) => void) | undefined;
  /** Tag (or a lazy getter, when the tag is defined by this very kit) that wraps loose inline content in block containers. */
  readonly wrapLooseInline?: AnyTag | (() => AnyTag) | undefined;
  /** Default id base for tags without an own `key`: `key: (node) => node.meta.title as string | undefined`. */
  readonly key?: ((node: BaseNode) => string | undefined) | undefined;
}

export interface TagKit<A extends PropsSpec = {}, R extends PropsSpec = {}, N extends PropsSpec = {}> {
  readonly defineBlock: BlockDefiner<A, R, N>;
  readonly defineInline: InlineDefiner<A, R, N>;
  /** Re-create a foreign tag inside this kit (gains common props and hooks). */
  adopt<T extends Tag<any, any, any, any>>(tag: T): T extends Tag<infer D, any, any, infer P> ? Tag<D, import('./tag.js').CommonProps<D, A, R>, import('./tag.js').KitMeta<A, R, N>, P> : never;
  readonly kit: KitRuntime;
}

/**
 * Create a tag kit: an integrator's own `defineBlock`/`defineInline` with common props,
 * typed meta and hooks — what a generator needs instead of re-declaring tag types by hand.
 */
export function createTagKit<A extends PropsSpec = {}, R extends PropsSpec = {}, N extends PropsSpec = {}>(
  options: KitOptions<A, R, N> = {},
): TagKit<A, R, N> {
  const always = options.common?.always ?? ({} as PropsSpec);
  const refable = options.common?.refable ?? ({} as PropsSpec);
  const specCache = new WeakMap<BaseDef, PropsSpec>();

  const kit: KitRuntime = {
    commonSpecFor(def) {
      const cached = specCache.get(def);
      if (cached) return cached;
      const spec: PropsSpec = {};
      const optOut = def.common ?? {};
      for (const [k, v] of Object.entries(always)) if (optOut[k] !== false) spec[k] = v;
      if (def.ref !== 'none') {
        for (const [k, v] of Object.entries(refable)) if (optOut[k] !== false) spec[k] = v;
      }
      specCache.set(def, spec);
      return spec;
    },
    onElement: options.onElement,
    onInclude: options.onInclude,
    wrapLooseInline: options.wrapLooseInline,
    defaultKey: options.key,
  };

  const definers = makeDefiners(kit);
  return {
    defineBlock: definers.defineBlock as BlockDefiner<A, R, N>,
    defineInline: definers.defineInline as InlineDefiner<A, R, N>,
    adopt: ((tag: AnyTag) => createTag(tag.def, kit, tag.preset ? { ...tag.preset } : undefined)) as TagKit<A, R, N>['adopt'],
    kit,
  };
}
