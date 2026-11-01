/**
 * Standard Schema (https://standardschema.dev) — vendored interface.
 *
 * TSProse accepts any Standard Schema compatible validator (Zod, Valibot, ArkType, …)
 * for tag props. The interface is vendored on purpose: emitted declarations of packages
 * that define tags must not depend on a transitive `@standard-schema/spec` type package.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['input'];
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['output'];
}

/** Output type of a Standard Schema value (or `never` when it is not one). */
export type InferOutput<S> = S extends {
  readonly '~standard': { readonly types?: infer T };
}
  ? T extends { readonly output: infer O }
    ? O
    : never
  : never;

/** A map of prop name → Standard Schema. */
export type PropsSpec = Record<string, StandardSchemaV1>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * What a tag's `props` may be: a record of per-prop schemas (the common case, JSDoc on each prop shows on hover)
 * or a single Standard Schema of the whole props object — for cross-prop rules such as mutually exclusive
 * sets of props (`s.exclusive(…)`, `s.union(…)`, a Zod discriminated union, …).
 */
export type PropsInput = PropsSpec | StandardSchemaV1<any, any>;

/** True when `props` is one schema for the whole object (has the Standard Schema `~standard` marker). */
export function isObjectSchema(
  props: PropsInput | undefined,
): props is StandardSchemaV1 {
  return typeof props === 'object' && props !== null && '~standard' in props;
}

/** Props object type of a {@link PropsInput}. */
export type PropsOf<P> = P extends {
  readonly '~standard': { readonly types?: infer T };
}
  ? T extends { readonly output: infer O }
    ? O
    : Record<string, unknown>
  : P extends PropsSpec
    ? InferProps<P>
    : never;

/** Distributes over unions (plain `Omit` collapses a union of prop sets into their common keys). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type UnionKeys<T> = T extends unknown ? keyof T : never;

/** Exactly one member of `U`: keys of the other members are `?: never` there (like `ts-xor`). */
export type ExclusiveOf<U, All = U> = U extends unknown
  ? U & { [K in Exclude<UnionKeys<All>, keyof U>]?: never }
  : never;

/** Prop names known for a {@link PropsInput} (record keys, or `keys` exposed by an object-like schema). */
export function propKeys(props: PropsInput): readonly string[] {
  if (!isObjectSchema(props)) return Object.keys(props);
  return (props as { keys?: readonly string[] }).keys ?? [];
}

/**
 * Props object type inferred from a {@link PropsSpec}.
 * A prop is optional when its schema output type includes `undefined`.
 * Both halves are homomorphic mapped types (`keyof P as …`), so JSDoc written on the spec
 * properties survives into the props type and shows on hover in JSX.
 */
export type InferProps<P extends PropsSpec> = Simplify<
  {
    -readonly [
      K in keyof P as undefined extends InferOutput<P[K]> ? never : K
    ]: InferOutput<P[K]>;
  } & {
    -readonly [
      K in keyof P as undefined extends InferOutput<P[K]> ? K : never
    ]?: InferOutput<P[K]>;
  }
>;

//
// Built-in mini schema set `s` (itself Standard Schema compatible, sync, JSON-safe).
//

export type Schema<T> = StandardSchemaV1<T, T> & {
  /** Validate synchronously; throws a TypeError on failure. Convenience for tests and hooks. */
  readonly parse: (value: unknown) => T;
  /** Object keys this schema knows about (object-like `s` schemas only). Used by tooling (analyzer, manifests). */
  readonly keys?: readonly string[] | undefined;
};

type Issue = StandardSchemaV1.Issue;

//
// Reference metadata carried by schemas (set by `refSchema`, propagated through wrappers)
//

/** How a prop holding a reference relates its document to the target (see `refSchema`). */
export interface RefMeta {
  /** Relation kind (`'link'` by default, `'include'` for transclusion, or any integrator kind). */
  readonly kind: string;
  /** Expected target tag name, when the schema was created for one tag. */
  readonly tag?: string | undefined;
}

const REF_META = Symbol.for('tsprose.refMeta');
const REF_PROPS = Symbol.for('tsprose.refProps');

/** Reference metadata of a schema that accepts references (`refSchema`, or a wrapper/union around one). */
export function refMetaOf(schema: unknown): RefMeta | undefined {
  return schema && typeof schema === 'object'
    ? (schema as Record<symbol, RefMeta | undefined>)[REF_META]
    : undefined;
}

/** Per-key reference metadata of an object-like schema (`s.object`, `s.exclusive`, unions of them). */
export function refPropsOf(
  schema: unknown,
): Readonly<Record<string, RefMeta>> | undefined {
  return schema && typeof schema === 'object'
    ? (schema as Record<symbol, Record<string, RefMeta> | undefined>)[REF_PROPS]
    : undefined;
}

/** Attach reference metadata to a schema (non-enumerable). Used by `refSchema`; returns the same schema. */
export function withRefMeta<S extends object>(schema: S, meta: RefMeta): S {
  Object.defineProperty(schema, REF_META, {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return schema;
}

/** Reference metadata of a whole props spec (record of schemas or one object schema), by prop name. */
export function refPropsOfProps(
  props: PropsInput | undefined,
): Readonly<Record<string, RefMeta>> {
  if (!props) return {};
  if (isObjectSchema(props)) return refPropsOf(props) ?? {};
  const out: Record<string, RefMeta> = {};
  for (const [key, schema] of Object.entries(props)) {
    const meta = refMetaOf(schema);
    if (meta) out[key] = meta;
  }
  return out;
}

function inherit<S extends object>(schema: S, sources: readonly unknown[]): S {
  const meta = sources.map(refMetaOf).find(Boolean);
  if (meta)
    Object.defineProperty(schema, REF_META, {
      value: meta,
      enumerable: false,
      configurable: true,
    });
  const props: Record<string, RefMeta> = {};
  for (const source of sources) Object.assign(props, refPropsOf(source));
  if (Object.keys(props).length)
    Object.defineProperty(schema, REF_PROPS, {
      value: props,
      enumerable: false,
      configurable: true,
    });
  return schema;
}

function fail(
  message: string,
  path?: readonly PropertyKey[],
): StandardSchemaV1.FailureResult {
  return { issues: [path && path.length ? { message, path } : { message }] };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function make<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T>,
  keys?: readonly string[],
): Schema<T> {
  const schema: Schema<T> = {
    ...(keys ? { keys } : {}),
    '~standard': { version: 1, vendor: 'tsprose', validate },
    parse(value: unknown): T {
      const result = validate(value);
      if (result.issues) {
        throw new TypeError(result.issues.map((i) => i.message).join('; '));
      }
      return result.value;
    },
  };
  return schema;
}

function prefixIssues(issues: readonly Issue[], key: PropertyKey): Issue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: [key, ...(issue.path ?? [])],
  }));
}

export type Primitive = string | number | boolean | null | undefined;

export const s = {
  string: (): Schema<string> =>
    make((v) =>
      typeof v === 'string'
        ? { value: v }
        : fail(`Expected string, received ${describe(v)}`),
    ),

  number: (): Schema<number> =>
    make((v) =>
      typeof v === 'number' && Number.isFinite(v)
        ? { value: v }
        : fail(`Expected finite number, received ${describe(v)}`),
    ),

  boolean: (): Schema<boolean> =>
    make((v) =>
      typeof v === 'boolean'
        ? { value: v }
        : fail(`Expected boolean, received ${describe(v)}`),
    ),

  literal: <const L extends Primitive>(literal: L): Schema<L> =>
    make((v) =>
      v === literal
        ? { value: v as L }
        : fail(
            `Expected ${JSON.stringify(literal)}, received ${JSON.stringify(v)}`,
          ),
    ),

  enum: <const V extends readonly Primitive[]>(values: V): Schema<V[number]> =>
    make((v) =>
      (values as readonly unknown[]).includes(v)
        ? { value: v as V[number] }
        : fail(
            `Expected one of ${values.map((x) => JSON.stringify(x)).join(', ')}, received ${JSON.stringify(v)}`,
          ),
    ),

  optional: <T>(inner: StandardSchemaV1<unknown, T>): Schema<T | undefined> =>
    inherit(
      make<T | undefined>((v) =>
        v === undefined ? { value: undefined } : runSync(inner, v),
      ),
      [inner],
    ),

  nullable: <T>(inner: StandardSchemaV1<unknown, T>): Schema<T | null> =>
    inherit(
      make<T | null>((v) => (v === null ? { value: null } : runSync(inner, v))),
      [inner],
    ),

  array: <T>(inner: StandardSchemaV1<unknown, T>): Schema<T[]> =>
    inherit(
      make((v) => {
        if (!Array.isArray(v))
          return fail(`Expected array, received ${describe(v)}`);
        const out: T[] = [];
        const issues: Issue[] = [];
        v.forEach((item, index) => {
          const r = runSync(inner, item);
          if (r.issues) issues.push(...prefixIssues(r.issues, index));
          else out.push(r.value);
        });
        return issues.length ? { issues } : { value: out };
      }),
      [inner],
    ),

  object: <const Shape extends PropsSpec>(
    shape: Shape,
  ): Schema<InferProps<Shape>> =>
    inherit(
      make((v) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
          return fail(`Expected object, received ${describe(v)}`);
        }
        const input = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        const issues: Issue[] = [];
        for (const key of Object.keys(shape)) {
          const r = runSync(shape[key]!, input[key]);
          if (r.issues) issues.push(...prefixIssues(r.issues, key));
          else if (r.value !== undefined || key in input) out[key] = r.value;
        }
        for (const key of Object.keys(input)) {
          if (!(key in shape))
            issues.push({ message: `Unknown key "${key}"`, path: [key] });
        }
        return issues.length ? { issues } : { value: out as InferProps<Shape> };
      }, Object.keys(shape)),
      [{ [REF_PROPS]: refPropsOfProps(shape) }],
    ),

  record: <T>(inner: StandardSchemaV1<unknown, T>): Schema<Record<string, T>> =>
    inherit(
      make((v) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
          return fail(`Expected object, received ${describe(v)}`);
        }
        const out: Record<string, T> = {};
        const issues: Issue[] = [];
        for (const [key, item] of Object.entries(
          v as Record<string, unknown>,
        )) {
          const r = runSync(inner, item);
          if (r.issues) issues.push(...prefixIssues(r.issues, key));
          else out[key] = r.value;
        }
        return issues.length ? { issues } : { value: out };
      }),
      [inner],
    ),

  union: <const Members extends readonly StandardSchemaV1[]>(
    ...members: Members
  ): Schema<InferOutput<Members[number]>> =>
    inherit(
      make<InferOutput<Members[number]>>((v) => {
        const all: Issue[] = [];
        for (const member of members) {
          const r = runSync(member, v);
          if (!r.issues)
            return { value: r.value as InferOutput<Members[number]> };
          all.push(...r.issues);
        }
        return {
          issues: [
            {
              message: `No union member matched: ${all.map((i) => i.message).join(' | ')}`,
            },
          ],
        };
      }, memberKeys(members)),
      members,
    ),

  /**
   * Exactly one of several prop sets (each usually an `s.object`): `s.exclusive(s.object({ yes: … }), s.object({ answer: … }))`.
   * Types forbid mixing keys of different members (`?: never`); at runtime the first matching member wins and keys
   * belonging only to other members are reported. Use as a tag's whole `props` schema.
   */
  exclusive: <const Members extends readonly StandardSchemaV1[]>(
    ...members: Members
  ): Schema<ExclusiveOf<InferOutput<Members[number]>>> => {
    const keys = memberKeys(members);
    const keySets = members.map(
      (m) => new Set((m as { keys?: readonly string[] }).keys ?? []),
    );
    return inherit(
      make<ExclusiveOf<InferOutput<Members[number]>>>((v) => {
        const present =
          v && typeof v === 'object'
            ? Object.keys(v).filter(
                (k) => (v as Record<string, unknown>)[k] !== undefined,
              )
            : [];
        // Pick the member that owns the given keys; report keys from different members as a conflict.
        const owners = keySets.map((set, i) => ({
          i,
          hits: present.filter((k) => set.has(k)).length,
        }));
        const best = owners
          .filter((o) => o.hits > 0)
          .sort((a, b) => b.hits - a.hits);
        const conflicting = present.filter(
          (k) =>
            best.length > 0 && !keySets[best[0]!.i]!.has(k) && keys.includes(k),
        );
        if (conflicting.length) {
          return fail(
            `Props ${present
              .filter((k) => keys.includes(k))
              .map((k) => `"${k}"`)
              .join(', ')} cannot be combined (mutually exclusive)`,
          );
        }
        const order = best.length
          ? [best[0]!.i, ...[...members.keys()].filter((i) => i !== best[0]!.i)]
          : [...members.keys()];
        const issues: Issue[] = [];
        for (const i of order) {
          const r = runSync(members[i]!, v);
          if (!r.issues)
            return {
              value: r.value as ExclusiveOf<InferOutput<Members[number]>>,
            };
          if (i === order[0]) issues.push(...r.issues);
        }
        return { issues };
      }, keys),
      members,
    );
  },

  unknown: (): Schema<unknown> => make((v) => ({ value: v })),

  /** Custom check with a type predicate or a boolean check; `T` is what the value is narrowed to. */
  custom: <T>(
    check: (value: unknown) => boolean,
    message = 'Custom check failed',
  ): Schema<T> => make((v) => (check(v) ? { value: v as T } : fail(message))),
};

function memberKeys(members: readonly StandardSchemaV1[]): string[] {
  return [
    ...new Set(
      members.flatMap((m) => (m as { keys?: readonly string[] }).keys ?? []),
    ),
  ];
}

/** Run a Standard Schema synchronously. Async validators are reported as an issue. */
export function runSync<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
): StandardSchemaV1.Result<T> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    return {
      issues: [
        {
          message:
            'Async validation is not supported in TSProse tags (JSX evaluation is synchronous)',
        },
      ],
    };
  }
  return result;
}

export interface PropIssue {
  readonly key: string;
  readonly message: string;
}

/**
 * Validate a props object against a {@link PropsSpec}.
 * Keys listed in `ignore` are skipped; other unknown keys produce an issue.
 */
export function validateProps(
  spec: PropsInput,
  input: Record<string, unknown>,
  ignore: ReadonlySet<string> = new Set(),
): { value: Record<string, unknown>; issues: PropIssue[] } {
  if (isObjectSchema(spec)) {
    // Whole-object schema: undefined values mean "not given".
    const given: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input))
      if (v !== undefined && !ignore.has(k)) given[k] = v;
    const r = runSync(spec, given);
    if (!r.issues)
      return { value: (r.value ?? {}) as Record<string, unknown>, issues: [] };
    return {
      value: given,
      issues: r.issues.map((issue) => {
        const path = formatIssuePath(issue);
        const key = path?.split('.')[0] ?? '';
        return {
          key,
          message: path ? `${path}: ${issue.message}` : issue.message,
        };
      }),
    };
  }
  const record = spec as PropsSpec;
  const value: Record<string, unknown> = {};
  const issues: PropIssue[] = [];
  for (const key of Object.keys(record)) {
    const r = runSync(record[key]!, input[key]);
    if (r.issues) {
      for (const issue of r.issues) {
        const path = formatIssuePath(issue);
        issues.push({
          key,
          message: path
            ? `${key}.${path}: ${issue.message}`
            : `${key}: ${issue.message}`,
        });
      }
    } else if (r.value !== undefined) {
      value[key] = r.value;
    }
  }
  for (const key of Object.keys(input)) {
    if (!(key in record) && !ignore.has(key)) {
      issues.push({ key, message: `Unknown prop "${key}"` });
    }
  }
  return { value, issues };
}

/** Dotted path of a Standard Schema issue (`a.0.b`), or undefined for a root issue. */
function formatIssuePath(issue: StandardSchemaV1.Issue): string | undefined {
  return issue.path
    ?.map((p) => (typeof p === 'object' ? String(p.key) : String(p)))
    .join('.');
}
