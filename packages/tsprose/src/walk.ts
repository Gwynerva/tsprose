import { isBaseNode, isTextNode, type AnyNode, type BaseNode } from './node.js';
import type { NodeOf } from './node.js';
import {
  isAddressable,
  isRef,
  isReferenceValue,
  type ReferenceValue,
} from './ref.js';
import { isPlainObject } from './util.js';
import type { AnyTag } from './tag.js';

export interface WalkContext {
  readonly parent: BaseNode | undefined;
  readonly index: number;
  readonly depth: number;
  readonly ancestors: readonly BaseNode[];
  /** Human readable path: `['root', 'theorem#pyth', 'paragraph[2]']`. */
  readonly path: readonly string[];
}

/** Returned by a visitor: `'skip'` skips the node's children, `'stop'` ends the walk. */
export type WalkSignal = void | 'skip' | 'stop';

export interface Visitor {
  enter?(node: AnyNode, ctx: WalkContext): WalkSignal;
  leave?(node: AnyNode, ctx: WalkContext): WalkSignal;
}

export interface AsyncVisitor {
  enter?(node: AnyNode, ctx: WalkContext): WalkSignal | Promise<WalkSignal>;
  leave?(node: AnyNode, ctx: WalkContext): WalkSignal | Promise<WalkSignal>;
}

export function labelOf(
  node: AnyNode,
  index: number,
  parent: BaseNode | undefined,
): string {
  if (isTextNode(node)) return `text[${index}]`;
  if (node.ref) return `${node.type}#${node.ref}`;
  if (node.id) return `${node.type}#${node.id}`;
  return parent ? `${node.type}[${index}]` : node.type;
}

/** Depth-first walk with enter/leave. `'skip'` skips the subtree, `'stop'` ends the walk. */
export function walk(
  root: AnyNode,
  visitor: Visitor | ((node: AnyNode, ctx: WalkContext) => WalkSignal),
): void {
  const v: Visitor =
    typeof visitor === 'function' ? { enter: visitor } : visitor;
  const ancestors: BaseNode[] = [];
  const path: string[] = [];
  const step = (
    node: AnyNode,
    index: number,
    parent: BaseNode | undefined,
  ): boolean => {
    path.push(labelOf(node, index, parent));
    const ctx: WalkContext = {
      parent,
      index,
      depth: ancestors.length,
      ancestors,
      path,
    };
    const signal = v.enter?.(node, ctx);
    if (signal === 'stop') return false;
    if (signal !== 'skip' && !isTextNode(node) && node.children) {
      ancestors.push(node);
      for (let i = 0; i < node.children.length; i++) {
        if (!step(node.children[i]!, i, node)) {
          ancestors.pop();
          return false;
        }
      }
      ancestors.pop();
    }
    const after = v.leave?.(node, ctx);
    path.pop();
    return after !== 'stop';
  };
  step(root, 0, undefined);
}

export async function walkAsync(
  root: AnyNode,
  visitor: AsyncVisitor,
): Promise<void> {
  const ancestors: BaseNode[] = [];
  const path: string[] = [];
  const step = async (
    node: AnyNode,
    index: number,
    parent: BaseNode | undefined,
  ): Promise<boolean> => {
    path.push(labelOf(node, index, parent));
    const ctx: WalkContext = {
      parent,
      index,
      depth: ancestors.length,
      ancestors,
      path,
    };
    const signal = await visitor.enter?.(node, ctx);
    if (signal === 'stop') return false;
    if (signal !== 'skip' && !isTextNode(node) && node.children) {
      ancestors.push(node);
      for (let i = 0; i < node.children.length; i++) {
        if (!(await step(node.children[i]!, i, node))) {
          ancestors.pop();
          return false;
        }
      }
      ancestors.pop();
    }
    const after = await visitor.leave?.(node, ctx);
    path.pop();
    return after !== 'stop';
  };
  await step(root, 0, undefined);
}

export function find(
  root: AnyNode,
  predicate: (node: AnyNode, ctx: WalkContext) => boolean,
): AnyNode | undefined {
  let found: AnyNode | undefined;
  walk(root, (node, ctx) => {
    if (predicate(node, ctx)) {
      found = node;
      return 'stop';
    }
  });
  return found;
}

export function findAll(
  root: AnyNode,
  predicate: (node: AnyNode, ctx: WalkContext) => boolean,
): AnyNode[] {
  const out: AnyNode[] = [];
  walk(root, (node, ctx) => {
    if (predicate(node, ctx)) out.push(node);
  });
  return out;
}

/** All nodes created by `tag` (matched by definition name), typed. */
export function select<T extends AnyTag>(root: AnyNode, tag: T): NodeOf<T>[] {
  return findAll(
    root,
    (n) => n.type === tag.def.name,
  ) as unknown as NodeOf<T>[];
}

/**
 * Deep copy of plain data (arrays, plain objects, primitives). Anything else — Ref handles, addressables, functions,
 * class instances, Dates — is kept by reference, so props may hold handles without breaking cloning.
 */
export function copyData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyData) as T;
  if (value && typeof value === 'object') {
    if (isRef(value) || isAddressable(value) || !isPlainObject(value))
      return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = copyData(v);
    return out as T;
  }
  return value;
}

/** Deep copy of a node tree (symbol-keyed internals are not copied). */
export function cloneNode<N extends AnyNode>(node: N): N {
  if (isTextNode(node)) return { ...node } as N;
  const copy: BaseNode = {
    ...node,
    props: copyData(node.props),
    data: copyData(node.data),
    meta: copyData(node.meta),
    children: node.children?.map((c) => cloneNode(c)),
  };
  if (node.diagnostics) copy.diagnostics = [...node.diagnostics];
  return copy as N;
}

export interface TreeIndex {
  readonly parents: WeakMap<AnyNode, BaseNode>;
  readonly byId: ReadonlyMap<string, BaseNode>;
  readonly byType: ReadonlyMap<string, BaseNode[]>;
  parentOf(node: AnyNode): BaseNode | undefined;
  ancestorsOf(node: AnyNode): BaseNode[];
}

/** Build parent pointers and id/type lookups for a tree. */
export function indexTree(root: AnyNode): TreeIndex {
  const parents = new WeakMap<AnyNode, BaseNode>();
  const byId = new Map<string, BaseNode>();
  const byType = new Map<string, BaseNode[]>();
  walk(root, (node, ctx) => {
    if (ctx.parent) parents.set(node, ctx.parent);
    if (isTextNode(node)) return;
    if (node.id) byId.set(node.id, node);
    const list = byType.get(node.type);
    if (list) list.push(node);
    else byType.set(node.type, [node]);
  });
  const parentOf = (node: AnyNode) => parents.get(node);
  return {
    parents,
    byId,
    byType,
    parentOf,
    ancestorsOf(node) {
      const out: BaseNode[] = [];
      let current = parentOf(node);
      while (current) {
        out.unshift(current);
        current = parentOf(current);
      }
      return out;
    },
  };
}

/**
 * Element nodes stored inside a node's `data` (e.g. prepared alternatives, answer options with content).
 * Scans plain objects and arrays deeply; nodes found are not descended into (their own children belong to them).
 * `compile` derives these nodes too, and `toJSON`/`fromJSON` serialize them compactly.
 */
export function nodesInData(
  value: unknown,
  out: BaseNode[] = [],
  seen: Set<unknown> = new Set(),
): BaseNode[] {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (isBaseNode(value)) {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) nodesInData(item, out, seen);
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return out;
  for (const item of Object.values(value as Record<string, unknown>))
    nodesInData(item, out, seen);
  return out;
}

/**
 * Reference values held by a node: in its props (`inProps`), meta (except `includedFrom`) and data, inside plain
 * objects and arrays up to three levels deep. Nodes stored in props/data are not entered (they are nodes of their own).
 */
export function forEachReference(
  node: BaseNode,
  fn: (key: string, value: ReferenceValue, inProps: boolean) => void,
): void {
  const visit = (
    key: string,
    value: unknown,
    depth: number,
    inProps: boolean,
  ) => {
    if (isReferenceValue(value)) return fn(key, value, inProps);
    if (depth > 2 || isBaseNode(value)) return;
    if (Array.isArray(value))
      value.forEach((v) => visit(key, v, depth + 1, inProps));
    else if (isPlainObject(value))
      for (const v of Object.values(value)) visit(key, v, depth + 1, inProps);
  };
  for (const [key, value] of Object.entries(node.props))
    visit(key, value, 0, true);
  for (const [key, value] of Object.entries(node.meta))
    if (key !== 'includedFrom') visit(key, value, 0, false);
  if (isPlainObject(node.data))
    for (const [key, value] of Object.entries(node.data))
      visit(key, value, 0, false);
}
