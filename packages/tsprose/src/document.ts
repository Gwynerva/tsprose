import type { ComponentResult } from './element.js';
import { makeFragment } from './element.js';
import { DiagnosticBag } from './diagnostics.js';
import { isAnyNode, type BaseNode } from './node.js';
import { REFS, type RefScope, type Refs, type RefsTemplate } from './ref.js';

export const DOCUMENT: unique symbol = Symbol.for('tsprose.document');

export interface DocumentOptions {
  /**
   * Stable document id, when the document owns it (e.g. a problem number) instead of the integrator deriving
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
}

export function defineDocument(content: () => ComponentResult, options: DocumentOptions = {}): Document {
  const refs = options.refs === undefined ? [] : Array.isArray(options.refs) ? [...options.refs] : [options.refs as Refs<RefsTemplate>];
  const first = refs[0];
  const scope: RefScope = first ? first[REFS] : { url: options.url, documentId: undefined };
  if (options.id !== undefined) {
    if (scope.documentId && scope.documentId !== options.id) {
      throw new TypeError(`defineDocument: id "${options.id}" conflicts with the refs' document "${scope.documentId}"`);
    }
    scope.documentId = options.id;
  }
  for (const r of refs) {
    if (r[REFS] !== scope) {
      // Several refs objects: they must agree on the document. Bind them to the first scope.
      if (r[REFS].documentId && scope.documentId && r[REFS].documentId !== scope.documentId) {
        throw new TypeError('defineDocument: refs objects belong to different documents');
      }
    }
  }
  return { [DOCUMENT]: true, content, refs, scope, meta: options.meta ?? {} };
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
    bag.error('document/threw', `Document content threw: ${(error as Error)?.message ?? String(error)}`);
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
