import type { DeriveFn } from './compile.js';
import type { ResolveFn } from './corpus-index.js';
import type { DeriveContext } from './def.js';
import { deriveKey, isJsonNodeSlot, nodeFromJSON, type JsonNode, type ProseJSON } from './json.js';
import type { BaseNode } from './node.js';
import { runPool } from './util.js';

/** A derive function used at serve time (the same shape as compile's): receives the node restored from JSON. */
export type JsonDeriveFn = DeriveFn;

export interface DeriveJSONOptions {
  /** Opaque context passed to the derive functions (`ctx.context`). */
  readonly context?: unknown;
  /** Derive functions running at once (default 8). */
  readonly concurrency?: number | undefined;
  /** Stops starting new derive tasks once aborted. */
  readonly signal?: AbortSignal | undefined;
  /**
   * Values computed earlier by key (e.g. per build): reused instead of calling the derive function again.
   * Successful values are added to it; failures are not cached.
   */
  readonly cache?: Map<string, unknown> | undefined;
  /** Recompute keys that the JSON already has values for (default false: existing values win). */
  readonly overwrite?: boolean | undefined;
  /** Resolve references from derive functions (`ctx.resolve(ref)`), usually `index.resolver()`. */
  readonly resolve?: ResolveFn | undefined;
  /** Called when a derive function throws; the node's value is `null`. */
  readonly onError?: ((error: unknown, node: BaseNode) => void) | undefined;
}

type JsonElement = Exclude<JsonNode, string>;

/**
 * Derive values for a *serialized* tree, after compilation: for data that depends on other documents or on the
 * state of the whole site (link targets, titles, back references), which is only known once everything is built
 * and may change without this document changing. Call it when serving the JSON.
 *
 * Nodes whose type has a function in `derive` get a derive key (`dk`, kept if present; otherwise `deriveKey`,
 * the same key `compile` uses) and a value in `derived`; nodes stored in props/data (`{ $node }`) are visited too.
 * Returns a new ProseJSON; the input is not mutated.
 */
export async function deriveJSON(
  json: ProseJSON,
  derive: Readonly<Record<string, JsonDeriveFn>>,
  options: DeriveJSONOptions = {},
): Promise<ProseJSON> {
  const derived: Record<string, unknown> = { ...(json.derived ?? {}) };
  const tasks = new Map<string, { node: BaseNode; fn: JsonDeriveFn }>();

  const visitValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visitValue);
    if (isJsonNodeSlot(value)) return { $node: visitNode(value.$node) };
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = visitValue(v);
      return out;
    }
    return value;
  };

  const visitNode = (node: JsonNode): JsonNode => {
    if (typeof node === 'string') return node;
    const copy: JsonElement & { dk?: string } = { ...node };
    if (node.p) (copy as { p?: unknown }).p = visitValue(node.p);
    if (node.d !== undefined) (copy as { d?: unknown }).d = visitValue(node.d);
    if (node.c) (copy as { c?: JsonNode[] }).c = node.c.map(visitNode);
    const fn = derive[node.t];
    if (fn) {
      const restored = nodeFromJSON(node) as BaseNode;
      const key = node.dk ?? deriveKey(restored);
      copy.dk = key;
      if (options.overwrite || !(key in derived)) {
        const cached = options.cache?.get(key);
        if (cached !== undefined) derived[key] = cached;
        else if (!tasks.has(key)) tasks.set(key, { node: restored, fn });
      }
    }
    return copy;
  };

  const root = visitNode(json.root);
  const ctx: DeriveContext = { context: options.context, signal: options.signal, resolve: options.resolve };
  await runPool(
    [...tasks],
    options.concurrency,
    async ([key, task]) => {
      try {
        const value = await task.fn(task.node, ctx);
        const stored = value === undefined ? null : value;
        derived[key] = stored;
        options.cache?.set(key, stored);
      } catch (error) {
        derived[key] = null;
        options.onError?.(error, task.node);
      }
    },
    options.signal,
  );
  return { ...json, root, derived: Object.keys(derived).length ? derived : undefined };
}
