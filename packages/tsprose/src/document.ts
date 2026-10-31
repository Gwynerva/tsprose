import type { ComponentResult } from './element.js';
import { makeFragment } from './element.js';
import { DiagnosticBag } from './diagnostics.js';
import { isAnyNode, type BaseNode } from './node.js';
import { REFS, type RefScope, type Refs, type RefsTemplate } from './ref.js';
import { errorMessage } from './util.js';

export const DOCUMENT: unique symbol = Symbol.for('tsprose.document');

export interface DocumentOptions {
  /**
   * Stable document id, when the document owns it (e.g. an exercise number) instead of the integrator deriving
   * it from a file path. `corpus.add(doc)` uses it; adding under another id is an error.
   */
  readonly id?: string | undefined;
  /** Refs declared for this document (from `defineRefs`). One object or several. */
  readonly refs?: Refs<RefsTemplate> | readonly Refs<RefsTemplate>[] | undefined;
  /** Module URL when no refs are given (otherwise the refs' scope is reused). */
  readonly url?: string | undefined;
  /** Free-form document metadata (title, language, …) available to hooks. */
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A lazy document: the content function is evaluated by `compile`, never at import time.
 * Importing a document module (or its refs module) therefore costs nothing and cannot cycle.
 */
export interface Document {
  readonly [DOCUMENT]: true;
  readonly content: () => ComponentResult;
  readonly refs: readonly Refs<RefsTemplate>[];
  readonly scope: RefScope;
  readonly meta: Readonly<Record<string, unknown>>;
  /** The document's own id (`defineDocument({ id })`), when it does not get one from the integrator. */
  readonly id?: string | undefined;
}

export function defineDocument(content: () => ComponentResult, options: DocumentOptions = {}): Document {
  const refs = options.refs === undefined ? [] : Array.isArray(options.refs) ? [...options.refs] : [options.refs as Refs<RefsTemplate>];
  const first = refs[0];
  const scope: RefScope = first ? first[REFS] : { url: options.url, documentId: undefined };
  // Several refs objects must agree on the document.
  const ids = new Set([scope, ...refs.map((r) => r[REFS])].map((s) => s.documentId).filter((id) => id !== undefined));
  if (options.id !== undefined) ids.add(options.id);
  if (ids.size > 1) {
    throw new TypeError(`defineDocument: refs objects / id belong to different documents (${[...ids].join(', ')})`);
  }
  if (options.id !== undefined) {
    for (const s of [scope, ...refs.map((r) => r[REFS])]) s.documentId = options.id;
  }
  return { [DOCUMENT]: true, content, refs, scope, meta: options.meta ?? {}, ...(options.id !== undefined ? { id: options.id } : {}) };
}

export function isDocument(value: unknown): value is Document {
  return typeof value === 'object' && value !== null && (value as Document)[DOCUMENT] === true;
}

export const ROOT_TYPE = 'root';

/** Evaluate a document's content into a root node. Never throws; failures become diagnostics. */
export function evaluateDocument(doc: Document | BaseNode): BaseNode {
  if (!isDocument(doc)) return toRoot(doc);
  try {
    return toRoot(doc.content());
  } catch (error) {
    const bag = new DiagnosticBag();
    bag.error('document/threw', `Document content threw: ${errorMessage(error)}`);
    const root = toRoot(undefined);
    root.diagnostics = bag.items;
    return root;
  }
}

function toRoot(value: unknown): BaseNode {
  const fragment = isAnyNode(value) && !Array.isArray(value) && value.type !== 'fragment' ? makeFragment([value]) : makeFragment(value);
  return {
    type: ROOT_TYPE,
    kind: 'block',
    props: {},
    data: undefined,
    children: fragment.children,
    ref: undefined,
    meta: {},
    diagnostics: fragment.diagnostics,
  };
}
