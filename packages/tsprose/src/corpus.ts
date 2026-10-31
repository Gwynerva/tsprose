import type { Document } from './document.js';
import { addressOf, isRef, type Address, type Ref, type ReferenceValue } from './ref.js';

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
    const documentId = typeof a === 'string' ? a : doc.scope.documentId;
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
    if (existing && existing !== doc) this.remove(documentId);
    return this.bind(documentId, doc);
  }

  /** Remove a document (e.g. its file was deleted). Returns whether it was present. */
  remove(documentId: string): boolean {
    const doc = this.docs.get(documentId);
    if (!doc) return false;
    this.docs.delete(documentId);
    if (doc.scope.url && this.byUrl.get(doc.scope.url) === documentId) this.byUrl.delete(doc.scope.url);
    return true;
  }

  private bind(documentId: string, doc: Document): this {
    if (doc.scope.documentId && doc.scope.documentId !== documentId) {
      throw new TypeError(
        `Corpus: document "${documentId}" was already bound to id "${doc.scope.documentId}" (defineDocument({ id }) or a shared refs module?)`,
      );
    }
    doc.scope.documentId = documentId;
    for (const refs of doc.refs) {
      const scope = Object.getOwnPropertyDescriptor(refs, Symbol.for('tsprose.refs'))?.value as { documentId: string | undefined } | undefined;
      if (scope) scope.documentId = documentId;
    }
    this.docs.set(documentId, doc);
    if (doc.scope.url) this.byUrl.set(doc.scope.url, documentId);
    return this;
  }

  get(documentId: string): Document | undefined {
    return this.docs.get(documentId);
  }

  has(documentId: string): boolean {
    return this.docs.has(documentId);
  }

  idOfUrl(url: string): string | undefined {
    return this.byUrl.get(url);
  }

  ids(): string[] {
    return [...this.docs.keys()];
  }

  entries(): [string, Document][] {
    return [...this.docs.entries()];
  }

  /** Resolve a handle to its document id (undefined when its document is not in the corpus). */
  resolve(ref: Ref): { documentId: string; name: string } | undefined {
    const documentId = ref.scope.documentId ?? (ref.scope.url ? this.byUrl.get(ref.scope.url) : undefined);
    return documentId && this.docs.has(documentId) ? { documentId, name: ref.name } : undefined;
  }

  /** Address of a handle or serialized reference, using this corpus to bind handles by module URL. */
  addressOf(value: ReferenceValue): Address | undefined {
    if (isRef(value)) {
      const resolved = this.resolve(value);
      return resolved ?? addressOf(value);
    }
    return addressOf(value);
  }
}
