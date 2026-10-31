import type { CompileResult } from './compile.js';
import type { Diagnostic, Severity, SourcePos } from './diagnostics.js';
import { nodeFromJSON, type ProseJSON } from './json.js';
import { isTextNode, type BaseNode } from './node.js';
import { addressKey, addressOf, isReferenceValue, type Address, type ReferenceValue } from './ref.js';
import { compareStrings } from './util.js';
import { forEachReference, walk } from './walk.js';

//
// Types
//

/**
 * What a document needs when a document it references changes:
 * - `recompile` — its compiled output embeds the target (transclusion);
 * - `rederive` — values derived from the target (titles, previews, link storage) must be recomputed;
 * - `none` — a pure relation; only validation may change.
 */
export type InvalidationPolicy = 'recompile' | 'rederive' | 'none';

/** What to report for a reference whose target does not exist. */
export type DanglingSeverity = Severity | 'ignore';

export interface CorpusIndexOptions {
  /** Policy per relation kind. Defaults: `include` → `recompile`; any other kind → {@link defaultPolicy}. */
  readonly kinds?: Readonly<Record<string, InvalidationPolicy>> | undefined;
  /** Policy of kinds not listed in `kinds` (default `'rederive'`). */
  readonly defaultPolicy?: InvalidationPolicy | undefined;
  /**
   * Severity of references whose target is missing (default `'error'`). A function decides per edge: allow stubs
   * for not yet written documents, ignore external namespaces (`ext:…`), downgrade one kind to a warning, ….
   */
  readonly dangling?: DanglingSeverity | ((edge: IndexedEdge) => DanglingSeverity) | undefined;
  /** Name under which an element is addressable (default: its ref name `$`). Return undefined for "not addressable". */
  readonly name?: ((node: BaseNode) => string | undefined) | undefined;
}

/** An addressable element of an indexed document. */
export interface IndexedTarget {
  readonly name: string;
  /** Tag name (node type). */
  readonly type: string;
  /** Element id in the compiled document (anchor). */
  readonly id?: string | undefined;
  /** Human readable ancestry inside its document. */
  readonly path: readonly string[];
}

/** A reference between documents (or inside one), as stored by the index. Serializable. */
export interface IndexedEdge {
  /** Referencing document. */
  readonly from: string;
  /** Type of the referencing node. */
  readonly source: string;
  readonly prop: string;
  readonly kind: string;
  readonly target: Address;
  /** Tag name the referencing prop expects (`refSchema(Theorem)`). */
  readonly expects?: string | undefined;
  /** Element ids of the referencing node and its ancestors (outermost first). */
  readonly within: readonly string[];
  readonly path: readonly string[];
  readonly pos?: SourcePos | undefined;
}

export interface IndexedDocument {
  readonly id: string;
  /** Declared without content (a section, a person, an external object, a planned document, …). */
  readonly virtual: boolean;
  readonly meta: Readonly<Record<string, unknown>>;
  /** Addressable elements by name. For a virtual document without declared names, any name is accepted. */
  readonly targets: ReadonlyMap<string, IndexedTarget>;
  readonly edges: readonly IndexedEdge[];
  /** Virtual documents declared without names accept any element name. */
  readonly openNames: boolean;
}

/** Raw document entry for {@link CorpusIndex.set} (any source: compile results, JSON, a database, …). */
export interface IndexEntryInput {
  readonly targets?: Iterable<IndexedTarget> | undefined;
  readonly edges?: Iterable<Omit<IndexedEdge, 'from'>> | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

/** A resolved reference: the canonical address (aliases followed), its document and element. */
export interface ResolvedAddress {
  readonly address: Address;
  readonly document: IndexedDocument;
  /** The element, when the address names one that exists (undefined for whole-document addresses). */
  readonly target?: IndexedTarget | undefined;
}

export type ResolveFn = (value: Address | ReferenceValue) => ResolvedAddress | undefined;

/** One document's names and their tag names: input of `generateRegistryTypes`. */
export interface RegistryEntry {
  readonly id: string;
  readonly names: Readonly<Record<string, string>>;
}

/** What documents need after some documents changed (see {@link CorpusIndex.affected}). */
export type AffectedAction = 'recompile' | 'rederive' | 'revalidate';

export interface CorpusIndexJSON {
  readonly v: 1;
  readonly documents: readonly {
    readonly id: string;
    readonly virtual?: true | undefined;
    readonly openNames?: true | undefined;
    readonly meta?: Readonly<Record<string, unknown>> | undefined;
    readonly targets: readonly IndexedTarget[];
    readonly edges: readonly Omit<IndexedEdge, 'from'>[];
  }[];
  readonly aliases?: Readonly<Record<string, string>> | undefined;
}

//
// Index
//

const RANK: Record<AffectedAction, number> = { revalidate: 0, rederive: 1, recompile: 2 };

/**
 * What a corpus contains: addressable elements of every document and the references between documents.
 * Built incrementally from compile results (or raw entries), it answers the questions every multi-document
 * system has — does this reference point anywhere, who references this, what references are inside this element,
 * which documents must be rebuilt when these change — without knowing anything about URLs, titles or routing.
 */
export class CorpusIndex {
  readonly options: CorpusIndexOptions;
  private readonly docs = new Map<string, IndexedDocument>();
  /** target document id (as written) → referencing document ids. */
  private readonly referrers = new Map<string, Set<string>>();
  private readonly aliases = new Map<string, string>();
  /** alias target → aliases pointing directly to it. */
  private readonly aliasesTo = new Map<string, Set<string>>();

  constructor(options: CorpusIndexOptions = {}) {
    this.options = options;
  }

  //
  // Building
  //

  /** Index a compiled document (replaces its previous entry). */
  update(result: CompileResult, meta?: Readonly<Record<string, unknown>>): this {
    const id = result.documentId;
    if (!id) throw new TypeError('CorpusIndex.update: the compile result has no document id');
    const edges: Omit<IndexedEdge, 'from'>[] = [];
    for (const o of result.outgoing) {
      if (!o.target) continue;
      edges.push({ source: o.node.type, prop: o.prop, kind: o.kind, target: o.target, expects: o.expects, within: o.within, path: o.path, pos: o.node.pos });
    }
    return this.set(id, { targets: collectTargets(result.root, this.options.name), edges, meta });
  }

  /**
   * Index a document from its serialized JSON (systems that store prose, e.g. in a database, and never compile it
   * in this process). Relation kinds and expected tags are not part of JSON: references are `link`s, transcluded
   * copies `include`s. Otherwise the entry matches what {@link update} produces for the same document.
   */
  updateFromJSON(json: ProseJSON, meta?: Readonly<Record<string, unknown>>): this {
    const id = json.documentId;
    if (!id) throw new TypeError('CorpusIndex.updateFromJSON: the JSON has no document id');
    const root = nodeFromJSON(json.root) as BaseNode;
    const edges: Omit<IndexedEdge, 'from'>[] = [];
    walk(root, (node, ctx) => {
      if (isTextNode(node)) return;
      const within = [...ctx.ancestors, node].map((n) => n.id).filter((x): x is string => x !== undefined);
      const path = [...ctx.path];
      const from = node.meta.includedFrom as { documentId?: string; name?: string } | undefined;
      if (from?.documentId) {
        const target: Address = from.name !== undefined ? { documentId: from.documentId, name: from.name } : { documentId: from.documentId };
        edges.push({ source: node.type, prop: 'of', kind: 'include', target, within, path });
      }
      forEachReference(node, (prop, value) => {
        const target = addressOf(value);
        if (target) edges.push({ source: node.type, prop, kind: 'link', target, within, path });
      });
    });
    return this.set(id, { targets: collectTargets(root, this.options.name), edges, meta });
  }

  /** Set a document entry from any source. */
  set(id: string, input: IndexEntryInput): this {
    this.forgetEdges(id);
    const targets = new Map<string, IndexedTarget>();
    for (const target of input.targets ?? []) targets.set(target.name, target);
    const edges = [...(input.edges ?? [])].map((e) => ({ ...e, from: id }));
    this.docs.set(id, { id, virtual: false, openNames: false, meta: input.meta ?? {}, targets, edges });
    for (const edge of edges) this.link(edge.target.documentId, id);
    return this;
  }

  /**
   * Declare a document without content: a section page, a person, an external object, a planned document.
   * With `names` (name → tag name) only those elements are addressable; without, any element name is accepted.
   * Declaring over an indexed document is ignored (real content wins).
   */
  declare(id: string, options: { readonly names?: Readonly<Record<string, string>>; readonly meta?: Readonly<Record<string, unknown>> } = {}): this {
    const existing = this.docs.get(id);
    if (existing && !existing.virtual) return this;
    const targets = new Map<string, IndexedTarget>();
    for (const [name, type] of Object.entries(options.names ?? {})) targets.set(name, { name, type, path: [] });
    this.docs.set(id, { id, virtual: true, openNames: !options.names, meta: options.meta ?? {}, targets, edges: [] });
    return this;
  }

  /**
   * Remove a document (deleted file, unpublished page). References to it become dangling; aliases pointing to it
   * are dropped. Referrers are remembered, so re-adding the document reports them in {@link affected}.
   */
  remove(id: string): boolean {
    if (!this.docs.has(id)) return false;
    this.forgetEdges(id);
    this.docs.delete(id);
    for (const alias of this.aliasesTo.get(id) ?? []) this.unalias(alias);
    return true;
  }

  /** Make an old id point to a new one (a moved document): references to `from` resolve to `to`. */
  alias(from: string, to: string): this {
    if (from === to) throw new TypeError(`CorpusIndex.alias: "${from}" cannot alias itself`);
    if (this.docs.has(from)) throw new TypeError(`CorpusIndex.alias: "${from}" is a document, not an old id`);
    for (let current: string | undefined = to; current !== undefined; current = this.aliases.get(current)) {
      if (current === from) throw new TypeError(`CorpusIndex.alias: alias cycle through "${from}"`);
    }
    this.unalias(from);
    this.aliases.set(from, to);
    let set = this.aliasesTo.get(to);
    if (!set) this.aliasesTo.set(to, (set = new Set()));
    set.add(from);
    return this;
  }

  private unalias(from: string): void {
    const to = this.aliases.get(from);
    if (to === undefined) return;
    this.aliases.delete(from);
    this.aliasesTo.get(to)?.delete(from);
  }

  private link(target: string, from: string): void {
    let set = this.referrers.get(target);
    if (!set) this.referrers.set(target, (set = new Set()));
    set.add(from);
  }

  private forgetEdges(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    for (const edge of doc.edges) this.referrers.get(edge.target.documentId)?.delete(id);
  }

  //
  // Queries
  //

  /** Follow aliases (`from → to → …`); `alias()` refuses cycles. */
  canonicalId(id: string): string {
    let current = id;
    for (let next = this.aliases.get(current); next !== undefined; next = this.aliases.get(current)) current = next;
    return current;
  }

  has(id: string): boolean {
    return this.docs.has(this.canonicalId(id));
  }

  get(id: string): IndexedDocument | undefined {
    return this.docs.get(this.canonicalId(id));
  }

  ids(): string[] {
    return [...this.docs.keys()];
  }

  documents(): IndexedDocument[] {
    return [...this.docs.values()];
  }

  /** Every reference of the corpus. */
  edges(): IndexedEdge[] {
    return [...this.docs.values()].flatMap((d) => d.edges);
  }

  /** Resolve an address, handle or serialized reference. Undefined when its document or element does not exist. */
  resolve(value: Address | ReferenceValue): ResolvedAddress | undefined {
    const raw = isReferenceValue(value) ? addressOf(value) : value;
    if (!raw) return undefined;
    const documentId = this.canonicalId(raw.documentId);
    const document = this.docs.get(documentId);
    if (!document) return undefined;
    const address: Address = { ...raw, documentId };
    if (raw.name === undefined) return { address, document };
    const target = document.targets.get(raw.name);
    if (!target && !document.openNames) return undefined;
    return { address, document, target };
  }

  /** `resolve` bound to this index (for `compile({ resolve })` / `deriveJSON({ resolve })`). */
  resolver(): ResolveFn {
    return (value) => this.resolve(value);
  }

  /**
   * References of a document — all of them, or only those inside one element (by its address name or element id):
   * `index.outgoing('dem/1234', 'solution-2')`.
   */
  outgoing(id: string, within?: string): IndexedEdge[] {
    const doc = this.get(id);
    if (!doc) return [];
    if (within === undefined) return [...doc.edges];
    const elementId = doc.targets.get(within)?.id ?? within;
    return doc.edges.filter((e) => e.within.includes(elementId));
  }

  /**
   * References pointing to a document (`'dem/1234'`) or to one element (`{ documentId, name }`), optionally of some
   * kinds only. Aliases are followed on both sides.
   */
  incoming(to: string | Address, options: { readonly kinds?: readonly string[] } = {}): IndexedEdge[] {
    const target = typeof to === 'string' ? { documentId: to } : to;
    const documentId = this.canonicalId(target.documentId);
    const out: IndexedEdge[] = [];
    for (const from of this.referrersOf(documentId)) {
      for (const edge of this.docs.get(from)?.edges ?? []) {
        if (this.canonicalId(edge.target.documentId) !== documentId) continue;
        if (target.name !== undefined && edge.target.name !== target.name) continue;
        if (options.kinds && !options.kinds.includes(edge.kind)) continue;
        out.push(edge);
      }
    }
    return out;
  }

  /** Documents referencing `documentId` directly or through any alias chain ending at it. */
  private referrersOf(documentId: string): Set<string> {
    const out = new Set<string>();
    const queue = [documentId];
    for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
      for (const from of this.referrers.get(id) ?? []) out.add(from);
      queue.push(...(this.aliasesTo.get(id) ?? []));
    }
    return out;
  }

  /** Invalidation policy of a relation kind. */
  policyOf(kind: string): InvalidationPolicy {
    return this.options.kinds?.[kind] ?? (kind === 'include' ? 'recompile' : (this.options.defaultPolicy ?? 'rederive'));
  }

  /**
   * Documents affected by changes to `changed` (edited, added or removed documents), with what they need.
   * `recompile` propagates (a recompiled document changes for its own includers); the changed documents themselves
   * are not listed. Call it before indexing the new versions when names may have been removed, or after — the
   * referrer graph is the same either way.
   */
  affected(changed: Iterable<string>): Map<string, AffectedAction> {
    const result = new Map<string, AffectedAction>();
    const start = new Set([...changed].map((id) => this.canonicalId(id)));
    const queue = [...start];
    const bump = (id: string, action: AffectedAction) => {
      if (start.has(id)) return false;
      const current = result.get(id);
      if (current && RANK[current] >= RANK[action]) return false;
      result.set(id, action);
      return true;
    };
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of this.incoming(id)) {
        const policy = this.policyOf(edge.kind);
        const action: AffectedAction = policy === 'none' ? 'revalidate' : policy;
        if (bump(edge.from, action) && action === 'recompile') queue.push(edge.from);
      }
    }
    return result;
  }

  //
  // Validation
  //

  /** Check references (of all documents, or of the given ones): missing documents, missing elements, wrong tags. */
  validate(ids?: Iterable<string>): Diagnostic[] {
    const out: Diagnostic[] = [];
    const docs = ids ? [...ids].map((id) => this.get(id)).filter((d): d is IndexedDocument => !!d) : [...this.docs.values()];
    for (const doc of docs) {
      for (const edge of doc.edges) {
        const where = `<${edge.source}> in "${doc.id}"`;
        const key = addressKey(edge.target);
        const document = this.get(edge.target.documentId);
        let problem: { code: string; message: string } | undefined;
        if (!document) {
          problem = { code: 'ref/missing-document', message: `Reference to "${key}" from ${where}: document "${edge.target.documentId}" does not exist` };
        } else if (edge.target.name !== undefined && !document.targets.has(edge.target.name) && !document.openNames) {
          problem = { code: 'ref/missing-target', message: `Reference to "${key}" from ${where}: document "${document.id}" has no element "${edge.target.name}"` };
        }
        if (problem) {
          const severity = this.severityOf(edge);
          if (severity !== 'ignore') out.push({ severity, ...problem, pos: edge.pos, path: edge.path });
          continue;
        }
        const target = edge.target.name !== undefined ? document!.targets.get(edge.target.name) : undefined;
        if (edge.expects && target && target.type !== edge.expects) {
          out.push({
            severity: 'error',
            code: 'ref/type-mismatch',
            message: `Reference to "${key}" from ${where} expects <${edge.expects}>, but the element is <${target.type}>`,
            pos: edge.pos,
            path: edge.path,
          });
        }
      }
    }
    return out;
  }

  private severityOf(edge: IndexedEdge): DanglingSeverity {
    const dangling = this.options.dangling ?? 'error';
    return typeof dangling === 'function' ? dangling(edge) : dangling;
  }

  //
  // Export
  //

  /** Names and tag names of every document with known names (input of `generateRegistryTypes`). */
  registryEntries(): RegistryEntry[] {
    return [...this.docs.values()]
      .filter((d) => !d.openNames)
      .map((d) => ({ id: d.id, names: Object.fromEntries([...d.targets.values()].map((t) => [t.name, t.type])) }))
      .sort((a, b) => compareStrings(a.id, b.id));
  }

  toJSON(): CorpusIndexJSON {
    return {
      v: 1,
      documents: [...this.docs.values()].map((d) => ({
        id: d.id,
        ...(d.virtual ? { virtual: true as const } : {}),
        ...(d.openNames ? { openNames: true as const } : {}),
        ...(Object.keys(d.meta).length ? { meta: d.meta } : {}),
        targets: [...d.targets.values()],
        edges: d.edges.map(({ from: _from, ...rest }) => rest),
      })),
      aliases: this.aliases.size ? Object.fromEntries(this.aliases) : undefined,
    };
  }

  static fromJSON(json: CorpusIndexJSON, options: CorpusIndexOptions = {}): CorpusIndex {
    if (json.v !== 1) throw new TypeError(`Unsupported corpus index version ${String((json as { v: unknown }).v)}`);
    const index = new CorpusIndex(options);
    for (const d of json.documents) {
      if (d.virtual) {
        index.declare(d.id, { names: d.openNames ? undefined : Object.fromEntries(d.targets.map((t) => [t.name, t.type])), meta: d.meta });
      } else {
        index.set(d.id, { targets: d.targets, edges: d.edges, meta: d.meta });
      }
    }
    for (const [from, to] of Object.entries(json.aliases ?? {})) index.alias(from, to);
    return index;
  }
}

function collectTargets(root: BaseNode, name: ((node: BaseNode) => string | undefined) | undefined): IndexedTarget[] {
  const out: IndexedTarget[] = [];
  walk(root, (node, ctx) => {
    if (isTextNode(node) || node === root) return;
    const n = name ? name(node) : node.ref;
    if (n !== undefined) out.push({ name: n, type: node.type, id: node.id, path: [...ctx.path] });
  });
  return out;
}
