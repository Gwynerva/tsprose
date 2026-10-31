import type { Document } from './document.js';
import { REFS, type Ref, type RefScope } from './ref.js';

/**
 * A set of documents with stable ids. Adding a document binds its refs scope to the id,
 * so handles imported elsewhere resolve to `(documentId, name)` by value.
 *
 * The corpus is what `compile` needs (documents to transclude, handles to bind). What documents *contain* —
 * their addressable elements and references between them — is kept by a {@link CorpusIndex} built from
 * compile results.
 */
export class Corpus {
  private readonly docs = new Map<string, Document>();
  private readonly byUrl = new Map<string, string>();

  /** Add a document under an id (or under its own `defineDocument({ id })`). Re-adding the same document is a no-op. */
  add(documentId: string, doc: Document): this;
  add(doc: Document): this;
  add(a: string | Document, b?: Document): this {
    const doc = typeof a === 'string' ? b! : a;
    const documentId = typeof a === 'string' ? a : (doc.id ?? doc.scope.documentId);
    if (!documentId) throw new TypeError('Corpus: document has no id (pass one to add() or to defineDocument({ id }))');
    const existing = this.docs.get(documentId);
    if (existing && existing !== doc) {
      throw new TypeError(`Corpus: document id "${documentId}" is already taken (use set() to replace it)`);
    }
    return this.bind(documentId, doc);
  }

  /** Add or replace the document under an id (e.g. a re-imported module in a dev server). */
  set(documentId: string, doc: Document): this {
    const existing = this.docs.get(documentId);
    if (existing === doc) return this;
    this.checkBinding(documentId, doc, existing);
    if (existing) this.remove(documentId);
    return this.bind(documentId, doc);
  }

  /** Remove a document (e.g. its file was deleted) and unbind its refs. Returns whether it was present. */
  remove(documentId: string): boolean {
    const doc = this.docs.get(documentId);
    if (!doc) return false;
    this.docs.delete(documentId);
    if (doc.scope.url && this.byUrl.get(doc.scope.url) === documentId) this.byUrl.delete(doc.scope.url);
    // Unbind, so the module can be added again under another id — unless the document owns its id.
    if (doc.id === undefined) {
      for (const scope of scopesOf(doc)) {
        if (scope.documentId === documentId) scope.documentId = undefined;
      }
    }
    return true;
  }

  /** Every scope of the document must be unbound or bound to this id (or to the document being replaced). */
  private checkBinding(documentId: string, doc: Document, replacing?: Document): void {
    for (const scope of scopesOf(doc)) {
      if (scope.documentId === undefined || scope.documentId === documentId) continue;
      if (replacing && scopesOf(replacing).includes(scope)) continue;
      throw new TypeError(
        `Corpus: document "${documentId}" was already bound to id "${scope.documentId}" (defineDocument({ id }) or a shared refs module?)`,
      );
    }
  }

  private bind(documentId: string, doc: Document): this {
    this.checkBinding(documentId, doc);
    for (const scope of scopesOf(doc)) scope.documentId = documentId;
    this.docs.set(documentId, doc);
    if (doc.scope.url) this.byUrl.set(doc.scope.url, documentId);
    return this;
  }

  /** The document under an id. */
  get(documentId: string): Document | undefined {
    return this.docs.get(documentId);
  }

  /** Whether a document is registered under the id. */
  has(documentId: string): boolean {
    return this.docs.has(documentId);
  }

  /** Document id of a refs/document module URL. */
  idOfUrl(url: string): string | undefined {
    return this.byUrl.get(url);
  }

  /** Ids of all documents, in insertion order. */
  ids(): string[] {
    return [...this.docs.keys()];
  }

  /** `[id, document]` pairs, in insertion order. */
  entries(): [string, Document][] {
    return [...this.docs.entries()];
  }

  /** Resolve a handle to its document id (undefined when its document is not in the corpus). */
  resolve(ref: Ref): { documentId: string; name: string } | undefined {
    const documentId = ref.scope.documentId ?? (ref.scope.url ? this.byUrl.get(ref.scope.url) : undefined);
    return documentId && this.docs.has(documentId) ? { documentId, name: ref.name } : undefined;
  }
}

/** The document's own scope and the scopes of all its refs objects. */
function scopesOf(doc: Document): RefScope[] {
  return [...new Set([doc.scope, ...doc.refs.map((r) => r[REFS])])];
}
