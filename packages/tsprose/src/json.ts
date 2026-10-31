import { attachDef } from './element.js';
import type { Kind } from './def.js';
import { isAnyNode, isTextNode, type AnyNode, type BaseNode } from './node.js';
import type { Prose } from './registry.js';
import type { AnyTag } from './tag.js';
import { validateProps } from './standard.js';
import { DiagnosticBag, type Diagnostic } from './diagnostics.js';
import { isReferenceValue, toRefTarget } from './ref.js';
import { canonicalJson, hashText } from './hash.js';

/** A node stored inside `data`/`props`, serialized compactly: `{ $node: <JsonNode> }`. */
export interface JsonNodeSlot {
  readonly $node: JsonNode;
}

export function isJsonNodeSlot(value: unknown): value is JsonNodeSlot {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$node' in value && Object.keys(value).length === 1;
}

/**
 * JSON form of a prop/data/meta value: references become `{ $ref }`, nodes become `{ $node }` (or, for content
 * hashing, their content without ids), `undefined` members are dropped.
 */
function jsonValue(value: unknown, node: (node: AnyNode) => unknown): unknown {
  if (isReferenceValue(value)) return toRefTarget(value);
  if (isAnyNode(value)) return { $node: node(value) };
  if (Array.isArray(value)) return value.map((v) => jsonValue(v, node));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = jsonValue(v, node);
    return out;
  }
  return value;
}

function sanitize(value: unknown): unknown {
  return jsonValue(value, nodeToJSON);
}

//
// Content hashes (ids of unnamed elements, derive keys)
//

/**
 * Content hash of a node: type, props and data (references and nested nodes in their JSON form) and the hashes of
 * its children — never ids, refs, meta or positions. Compiled nodes and nodes restored with `fromJSON` hash alike.
 */
export function contentHash(node: AnyNode, childHashes?: readonly string[]): string {
  if (isTextNode(node)) return hashText(`text:${node.text}`);
  const content = (n: AnyNode): unknown => (isTextNode(n) ? n.text : { t: n.type, h: contentHash(n) });
  return hashText(
    canonicalJson({
      t: node.type,
      p: jsonValue(node.props, content),
      d: jsonValue(node.data, content),
      c: childHashes ?? (node.children ?? []).map((c) => contentHash(c)),
    }),
  );
}

/** Derive key of a node: `type:contentHash`. Shared by `compile` and `deriveJSON`, so their caches agree. */
export function deriveKey(node: BaseNode, hash: string = contentHash(node)): string {
  return `${node.type}:${hash}`;
}

export type JsonNode =
  | string
  | {
      readonly t: string;
      readonly k: Kind;
      readonly p?: Record<string, unknown>;
      readonly d?: unknown;
      readonly m?: Record<string, unknown>;
      readonly r?: string;
      readonly id?: string;
      readonly dk?: string;
      readonly c?: JsonNode[];
    };

export interface ProseJSON {
  readonly v: 2;
  readonly documentId?: string | undefined;
  readonly root: JsonNode;
  readonly refs?: Record<string, string> | undefined;
  readonly derived?: Record<string, unknown> | undefined;
}

function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

export function nodeToJSON(node: AnyNode): JsonNode {
  if (isTextNode(node)) return node.text;
  const out: {
    t: string;
    k: Kind;
    p?: Record<string, unknown>;
    d?: unknown;
    m?: Record<string, unknown>;
    r?: string;
    id?: string;
    dk?: string;
    c?: JsonNode[];
  } = { t: node.type, k: node.kind };
  if (!isEmptyObject(node.props)) out.p = sanitize(node.props) as Record<string, unknown>;
  if (node.data !== undefined) out.d = sanitize(node.data);
  if (!isEmptyObject(node.meta)) out.m = sanitize(node.meta) as Record<string, unknown>;
  if (node.ref !== undefined) out.r = node.ref;
  if (node.id !== undefined) out.id = node.id;
  if (node.derived !== undefined) out.dk = node.derived;
  if (node.children && node.children.length) out.c = node.children.map(nodeToJSON);
  return out;
}

export interface ToJSONInput {
  readonly root: BaseNode;
  readonly documentId?: string | undefined;
  readonly refs?: ReadonlyMap<string, BaseNode> | undefined;
  readonly derived?: ReadonlyMap<string, unknown> | undefined;
}

/** Serialize a compiled tree. Positions, diagnostics and definitions are not included. */
export function toJSON(input: ToJSONInput): ProseJSON {
  const refs = input.refs ? Object.fromEntries([...input.refs].map(([name, node]) => [name, node.id ?? ''])) : undefined;
  const derived = input.derived ? Object.fromEntries(input.derived) : undefined;
  return {
    v: 2,
    documentId: input.documentId,
    root: nodeToJSON(input.root),
    refs: refs && Object.keys(refs).length ? refs : undefined,
    derived: derived && Object.keys(derived).length ? derived : undefined,
  };
}

export interface FromJSONOptions {
  /** Known tags: restores definitions on nodes and re-validates props. */
  readonly prose?: Prose<readonly AnyTag[]> | undefined;
  /** Throw on unknown types or invalid props instead of collecting diagnostics. */
  readonly strict?: boolean | undefined;
}

export interface FromJSONResult {
  readonly root: BaseNode;
  readonly documentId: string | undefined;
  readonly refs: Map<string, string>;
  readonly derived: Map<string, unknown>;
  readonly diagnostics: Diagnostic[];
}

/** Turn `{ $node }` slots (nodes stored in props/data) back into nodes. */
function restoreSlots(value: unknown, options: FromJSONOptions, bag: DiagnosticBag): unknown {
  if (isJsonNodeSlot(value)) return nodeFromJSON(value.$node, options, bag);
  if (Array.isArray(value)) return value.map((v) => restoreSlots(v, options, bag));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = restoreSlots(v, options, bag);
    return out;
  }
  return value;
}

export function nodeFromJSON(json: JsonNode, options: FromJSONOptions = {}, bag = new DiagnosticBag()): AnyNode {
  if (typeof json === 'string') return { type: 'text', kind: 'inline', text: json };
  const node: BaseNode = {
    type: json.t,
    kind: json.k,
    props: json.p ? (restoreSlots(json.p, options, bag) as Record<string, unknown>) : {},
    data: restoreSlots(json.d, options, bag),
    children: json.c ? json.c.map((c) => nodeFromJSON(c, options, bag)) : undefined,
    ref: json.r,
    meta: json.m ? { ...json.m } : {},
    id: json.id,
    derived: json.dk,
  };
  const tag = options.prose?.byName.get(json.t);
  if (tag) {
    attachDef(node, tag.def);
    const { issues } = validateProps(tag.def.props, node.props);
    for (const issue of issues) bag.error('props/invalid', `<${json.t}> ${issue.message}`);
  } else if (options.prose && json.t !== 'root' && json.t !== 'fragment') {
    bag.error('json/unknown-type', `Unknown node type "${json.t}"`);
  }
  return node;
}

export function fromJSON(json: ProseJSON, options: FromJSONOptions = {}): FromJSONResult {
  if (json.v !== 2) throw new TypeError(`Unsupported prose JSON version ${String((json as { v: unknown }).v)}`);
  const bag = new DiagnosticBag();
  const root = nodeFromJSON(json.root, options, bag) as BaseNode;
  if (options.strict && !bag.empty) {
    throw new TypeError(bag.items.map((d) => d.message).join('\n'));
  }
  return {
    root,
    documentId: json.documentId,
    refs: new Map(Object.entries(json.refs ?? {})),
    derived: new Map(Object.entries(json.derived ?? {})),
    diagnostics: bag.items,
  };
}
