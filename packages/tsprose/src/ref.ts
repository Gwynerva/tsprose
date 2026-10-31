import type { BaseDef } from './def.js';
import type { DefOf } from './node.js';
import type { AnyTag } from './tag.js';
import { canonicalJson } from './hash.js';
import { s, withRefMeta, type Schema } from './standard.js';

export const REF: unique symbol = Symbol.for('tsprose.ref');
export const REFS: unique symbol = Symbol.for('tsprose.refs');

/** Where a refs module lives. `documentId` is filled by the corpus/loader. */
export interface RefScope {
  readonly url: string | undefined;
  documentId: string | undefined;
}

/**
 * A typed handle marking one element of one document. Created by {@link defineRefs},
 * passed to a tag via `$` exactly once, and used by `<Ref to>`/`<Include of>` anywhere.
 */
export interface Ref<D extends BaseDef = BaseDef> {
  readonly [REF]: true;
  readonly name: string;
  readonly def: D;
  /** What the handle was declared with: a tag, or a component that builds nodes of that tag. */
  readonly tag: DefCarrier;
  readonly scope: RefScope;
}

/**
 * Anything that carries a tag definition: a tag, or a function component wrapping one
 * (`Object.assign((props) => Tag(…), { def: Tag.def })`). Refs only need the definition.
 */
export interface DefCarrier<D extends BaseDef = BaseDef> {
  readonly def: D;
}

/**
 * Only referable tags (ref: 'optional' | 'required') may be declared as refs — or components carrying
 * the definition of such a tag (see {@link DefCarrier}).
 */
export type RefsTemplate = Record<string, DefCarrier & { readonly def: { readonly ref: 'optional' | 'required' } }>;

export type Refs<T extends RefsTemplate> = { readonly [K in keyof T]: Ref<DefOf<T[K]>> } & {
  readonly [REFS]: RefScope;
};

export function isRef(value: unknown): value is Ref {
  return typeof value === 'object' && value !== null && (value as Ref)[REF] === true;
}

export function isRefs(value: unknown): value is Refs<RefsTemplate> {
  return typeof value === 'object' && value !== null && REFS in value;
}

/**
 * Declare the referable elements of a document.
 *
 * ```ts
 * // refs.ts (side-effect free; other documents import this, never the content)
 * export const refs = defineRefs(import.meta.url, { pythagoras: Theorem, _lemma: Details });
 * ```
 *
 * Every handle must be used exactly once (via `$`) in the document that owns these refs;
 * `compile` reports unused or duplicated handles. Tags given here must have `ref !== 'none'`.
 */
export function defineRefs<const T extends RefsTemplate>(scopeUrl: string | undefined, template: T): Refs<T>;
export function defineRefs<const T extends RefsTemplate>(template: T): Refs<T>;
export function defineRefs(a: string | undefined | Record<string, DefCarrier>, b?: Record<string, DefCarrier>): Refs<RefsTemplate> {
  const url = typeof a === 'string' ? a : undefined;
  const template = (typeof a === 'object' && a !== null ? a : b) ?? {};
  const scope: RefScope = { url, documentId: undefined };
  const out: Record<string, Ref> = {};
  for (const [name, tag] of Object.entries(template)) {
    if (tag.def.ref === 'none') {
      throw new TypeError(`defineRefs: "${name}" uses <${tag.def.name}> whose ref mode is 'none'`);
    }
    out[name] = { [REF]: true, name, def: tag.def, tag, scope };
  }
  Object.defineProperty(out, REFS, { value: scope, enumerable: false });
  return out as Refs<RefsTemplate>;
}

/** Enumerate handles of a refs object. */
export function listRefs(refs: Refs<RefsTemplate>): Ref[] {
  return Object.values(refs).filter(isRef);
}

//
// Addresses: references by id, independent of handles
//

/**
 * A place in a corpus: a whole document (`name` omitted) or one named element of it.
 * `params` is an opaque, JSON-serializable record that TSProse stores, indexes and passes to resolvers
 * without interpreting it (a version, a language, a generator seed, a fragment selector, …).
 */
export interface Address {
  readonly documentId: string;
  readonly name?: string | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Serialized reference stored in props/meta/data: what `toJSON` writes for a handle, and what {@link ref} creates.
 * `documentId` is undefined only for handles that were never bound to a corpus. `T` (type only) is the expected
 * target tag name, so a `refSchema(Theorem)` prop rejects an address typed for another tag.
 */
export interface RefTarget<T extends string = string> {
  readonly $ref: {
    readonly documentId: string | undefined;
    readonly name?: string | undefined;
    readonly params?: Readonly<Record<string, unknown>> | undefined;
  };
  /** Type-only brand: the target's tag name. Never present at runtime. */
  readonly __targetTag?: T;
}

export function isRefTarget(value: unknown): value is RefTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = (value as { $ref?: unknown }).$ref;
  if (typeof target !== 'object' || target === null) return false;
  const { documentId, name } = target as { documentId?: unknown; name?: unknown };
  return typeof name === 'string' || (typeof documentId === 'string' && name === undefined);
}

/**
 * Typed list of addressable documents — augment it (usually with a generated file, see `generateRegistryTypes`)
 * so {@link ref} checks document ids and element names and knows each element's tag:
 *
 * ```ts
 * declare module 'tsprose' {
 *   interface CorpusRegistry {
 *     'dem/1234': { statement: 'problemStatement'; solution: 'solution' };
 *     'ref/lagrange': { statement: 'theorem' };
 *   }
 * }
 * ```
 * Without augmentation any string is accepted.
 */
export interface CorpusRegistry {}

type RegistryIds = keyof CorpusRegistry extends never ? string : Extract<keyof CorpusRegistry, string>;
type RegistryNames<I> = keyof CorpusRegistry extends never
  ? string
  : I extends keyof CorpusRegistry
    ? Extract<keyof CorpusRegistry[I], string>
    : never;
/** Unknown target tag → `never` brand, which every `refSchema(Tag)` prop accepts (the index checks it at build time). */
type RegistryTag<I, N> = I extends keyof CorpusRegistry
  ? N extends keyof CorpusRegistry[I]
    ? Extract<CorpusRegistry[I][N], string>
    : never
  : never;

/**
 * Reference a document or one of its elements by id — no import of the target module needed, so it works for
 * generated documents, documents stored elsewhere and mutual references alike:
 * `<Link to={ref('dem/1234', 'solution')}>`, `<Link to={ref('ref/lagrange')}>`, `ref('dem/1234', 'statement', { seed: 3 })`.
 * The result is checked against {@link CorpusRegistry} at the type level and against the corpus index at build time.
 */
export function ref<const I extends RegistryIds, const N extends RegistryNames<I> | undefined = undefined>(
  documentId: I,
  name?: N,
  params?: Readonly<Record<string, unknown>>,
): RefTarget<RegistryTag<I, N>> {
  if (typeof documentId !== 'string' || !documentId) throw new TypeError('ref: document id must be a non-empty string');
  const $ref: { documentId: string; name?: string; params?: Readonly<Record<string, unknown>> } = { documentId };
  if (name !== undefined) $ref.name = name;
  if (params !== undefined) $ref.params = params;
  return { $ref } as RefTarget<RegistryTag<I, N>>;
}

/**
 * Protocol for values that *are* references without being handles or `{ $ref }` objects — a path proxy such as
 * `$CONTENT.algebra.quadratic`, an ORM record, a route object: implement `[ADDRESS]()` and every TSProse reference
 * consumer (`refSchema`, outgoing references, JSON, `<Include>`, the index) treats the value as that address.
 * Return undefined when the value cannot be addressed (reported as `ref/unresolved`).
 */
export const ADDRESS: unique symbol = Symbol.for('tsprose.address');

export interface Addressable {
  readonly [ADDRESS]: () => Address | undefined;
}

export function isAddressable(value: unknown): value is Addressable {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as Addressable)[ADDRESS] === 'function';
}

/** Any reference value: a handle, a serialized reference or an {@link Addressable}. */
export type ReferenceValue = Ref | RefTarget | Addressable;

export function isReferenceValue(value: unknown): value is ReferenceValue {
  return isRef(value) || isRefTarget(value) || isAddressable(value);
}

/** Serialized form of a handle or an addressable; serialized references are returned as is. */
export function toRefTarget(value: ReferenceValue): RefTarget {
  if (isRef(value)) return { $ref: { documentId: value.scope.documentId, name: value.name } };
  if (isRefTarget(value)) return value;
  const address = value[ADDRESS]();
  return address ? { $ref: { ...address } } : { $ref: { documentId: undefined } };
}

/** Canonical string of an address: `doc`, `doc#name`, with params appended as canonical JSON: `doc#name?{"seed":3}`. */
export function addressKey(address: Address): string {
  const base = address.name === undefined ? address.documentId : `${address.documentId}#${address.name}`;
  return address.params && Object.keys(address.params).length ? `${base}?${canonicalJson(address.params)}` : base;
}

/** Parse `doc` / `doc#name` (params are not parsed; use {@link ref} for them). */
export function parseAddress(text: string): Address {
  const hash = text.indexOf('#');
  return hash < 0 ? { documentId: text } : { documentId: text.slice(0, hash), name: text.slice(hash + 1) };
}

/** Address of a handle or serialized reference (undefined while its document id is unknown). */
export function addressOf(value: Ref | RefTarget | Addressable): Address | undefined {
  if (!isRef(value) && !isRefTarget(value)) return value[ADDRESS]();
  if (isRef(value)) return value.scope.documentId ? { documentId: value.scope.documentId, name: value.name } : undefined;
  const { documentId, name, params } = value.$ref;
  if (!documentId) return undefined;
  return { documentId, ...(name !== undefined ? { name } : {}), ...(params !== undefined ? { params } : {}) };
}

//
// Prop schema
//

export interface RefSchemaOptions {
  /**
   * Relation kind recorded for references held by this prop (default `'link'`). Kinds are free-form strings;
   * the corpus index maps them to invalidation policies (`include` → recompile, others → rederive by default).
   */
  readonly kind?: string | undefined;
}

/**
 * Prop schema accepting a reference: a handle from `defineRefs` or an address from {@link ref}
 * (optionally restricted to one tag): `props: { to: refSchema() }`, `props: { proves: refSchema(Theorem, { kind: 'proves' }) }`.
 * `compile` turns such props into outgoing references of the given kind.
 */
export function refSchema(options?: RefSchemaOptions): Schema<Ref | RefTarget>;
export function refSchema<T extends AnyTag>(tag: T, options?: RefSchemaOptions): Schema<Ref<DefOf<T>> | RefTarget<DefOf<T>['name']>>;
export function refSchema(a?: AnyTag | RefSchemaOptions, b?: RefSchemaOptions): Schema<Ref | RefTarget> {
  const tag = a && 'def' in a ? (a as AnyTag) : undefined;
  const options = (tag ? b : (a as RefSchemaOptions | undefined)) ?? {};
  const schema = s.custom<Ref | RefTarget>(
    (value) => (isRef(value) && (tag === undefined || value.def === tag.def)) || isRefTarget(value) || isAddressable(value),
    tag ? `Expected a ref to <${tag.def.name}>` : 'Expected a ref handle or a ref() address',
  );
  return withRefMeta(schema, { kind: options.kind ?? 'link', tag: tag?.def.name });
}
