import type { DeriveContext } from './def.js';
import { canonicalJson, hashText } from './hash.js';
import { nodeFromJSON, type JsonNode, type ProseJSON } from './json.js';
import type { BaseNode } from './node.js';
import type { ResolveFn } from './corpus-index.js';

/** A derive function used at serve time: receives the node restored from JSON. */
export type JsonDeriveFn = (node: BaseNode, ctx: DeriveContext) => unknown;

export interface DeriveJSONOptions {
  /** Opaque context passed to the derive functions (`ctx.context`). */
  readonly context?: unknown;
  readonly concurrency?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Values computed earlier by key (e.g. per build): reused instead of calling the derive function again. */
  readonly cache?: Map<string, unknown> | undefined;
  /** Recompute keys that the JSON already has values for (default false: existing values win). */
  readonly overwrite?: boolean | undefined;
  /** Resolve references from derive functions (`ctx.resolve(ref)`), usually `index.resolver()`. */
  readonly resolve?: ResolveFn | undefined;
}

type JsonElement = Exclude<JsonNode, string>;

/**
 * Derive values for a *serialized* tree, after compilation: for data that depends on other documents or on the
 * state of the whole site (link targets, titles, back references), which is only known once everything is built
 * and may change without this document changing. Call it when serving the JSON.
 *
 * Nodes whose type has a function in `derive` get a derive key (`dk`, kept if present) and a value in `derived`;
 * nodes stored in props/data (`{ $node }`) are visited too. Returns a new ProseJSON; the input is not mutated.
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
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if ('$node' in record && Object.keys(record).length === 1) return { $node: visitNode(record.$node as JsonNode) };
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) out[k] = visitValue(v);
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
      const key = node.dk ?? `${node.t}:${hashText(canonicalJson({ t: node.t, p: node.p, d: node.d, c: node.c }))}`;
      copy.dk = key;
      if (options.overwrite || !(key in derived)) {
        const cached = options.cache?.get(key);
        if (cached !== undefined) derived[key] = cached;
        else if (!tasks.has(key)) tasks.set(key, { node: nodeFromJSON(node) as BaseNode, fn });
      }
    }
    return copy;
  };

  const root = visitNode(json.root);
  const list = [...tasks];
  const ctx: DeriveContext = { context: options.context, signal: options.signal, resolve: options.resolve };
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const [key, task] = list[next++]!;
      if (options.signal?.aborted) return;
      let value: unknown;
      try {
        value = await task.fn(task.node, ctx);
      } catch (error) {
        value = { error: (error as Error)?.message ?? String(error) };
      }
      const stored = value === undefined ? null : value;
      derived[key] = stored;
      options.cache?.set(key, stored);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 8, list.length)) }, worker));
  return { ...json, root, derived: Object.keys(derived).length ? derived : undefined };
}
