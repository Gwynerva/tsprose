import { normalizeWhitespace, segmentLooseInline } from './children.js';
import { Corpus } from './corpus.js';
import type { BaseDef, DeriveContext } from './def.js';
import { DiagnosticBag, TSProseError, hasErrors, type Diagnostic, type Severity } from './diagnostics.js';
import { evaluateDocument, isDocument, ROOT_TYPE, type Document } from './document.js';
import { REF_HANDLE, getDef, getKit, getRefHandle, makeFragment } from './element.js';
import { canonicalJson, hashText } from './hash.js';
import { wrapperOf, type KitRuntime } from './kit.js';
import { isAnyNode, isTextNode, type AnyNode, type BaseNode } from './node.js';
import { REFS, isAddressable, isRef, isRefTarget, listRefs, toRefTarget, refSchema, type Address, type Ref, type RefScope, type RefTarget } from './ref.js';
import { CorpusIndex, type CorpusIndexOptions, type ResolveFn } from './corpus-index.js';
import { refPropsOfProps } from './standard.js';
import { slugify as defaultSlugify } from './slugify.js';
import { s } from './standard.js';
import { defineBlock } from './tag.js';
import { cloneNode, labelOf, nodesInData, walk, walkAsync, type WalkContext } from './walk.js';
import { nodeToJSON } from './json.js';

//
// Built-in transclusion tag
//

/**
 * Insert a compiled copy of another document's element: `<Include of={article.pythagoras} />`.
 * `meta` is merged into the copy's meta after the kit's `onInclude` ran (e.g. `{ toc: true }`).
 */
export const Include = defineBlock({
  name: 'include',
  props: { of: refSchema({ kind: 'include' }), meta: s.optional(s.record(s.unknown())) },
});

/** Non-enumerable marker on transcluded copies: the handle they were included through. */
const INCLUDE_REF = Symbol.for('tsprose.includeRef');

//
// Hooks
//

export interface HookContext {
  readonly documentId: string | undefined;
  readonly root: BaseNode;
  readonly document: Document | undefined;
  readonly corpus: Corpus | undefined;
  readonly context: unknown;
  report(code: string, message: string, node?: AnyNode, severity?: Severity): void;
}

/** Integrator hook: runs in the `index` phase (after ids and refs, before derive). */
export interface Hook<R = unknown> {
  readonly name: string;
  enter?(node: AnyNode, walk: WalkContext, ctx: HookContext): void;
  leave?(node: AnyNode, walk: WalkContext, ctx: HookContext): void;
  finish?(ctx: HookContext): R | Promise<R>;
}

export function defineHook<R>(hook: Hook<R>): Hook<R> {
  return hook;
}

//
// Options and result
//

export type DeriveFn = (node: BaseNode, ctx: DeriveContext) => unknown;

export interface CompileOptions {
  readonly corpus?: Corpus | undefined;
  /** Document id when compiling without a corpus (or to override). */
  readonly documentId?: string | undefined;
  /** Kit whose `wrapLooseInline` wraps loose inline content at the document root. */
  readonly kit?: KitRuntime | undefined;
  readonly slugify?: ((text: string) => string) | undefined;
  /** Per-type derive functions; override the definitions' own `derive`. */
  readonly derive?: Readonly<Record<string, DeriveFn>> | undefined;
  /** Previously derived values (cache): keys present here are not recomputed. */
  readonly derivedCache?: ReadonlyMap<string, unknown> | undefined;
  /**
   * Extra nodes to derive besides the tree (e.g. content a client-side generator may produce,
   * declared ahead of time so the server can precompute its derived data).
   */
  readonly deriveExtra?: ((root: BaseNode) => readonly BaseNode[]) | undefined;
  readonly hooks?: readonly Hook[] | undefined;
  /** Counter names per node type: `{ theorem: 'theorem', lemma: 'theorem' }` → `meta.number`. */
  readonly numbering?: Readonly<Record<string, string>> | undefined;
  readonly context?: unknown;
  /**
   * Resolve references from derive functions (`ctx.resolve(ref)`), e.g. `index.resolver()` of a {@link CorpusIndex}
   * built by an earlier pass. Derive values that depend on other documents are usually better computed at serve time
   * with `deriveJSON`, when the whole corpus is known.
   */
  readonly resolve?: ResolveFn | undefined;
  readonly concurrency?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Throw a TSProseError when any error-level diagnostic exists. */
  readonly strict?: boolean | undefined;
}

/** A reference from a compiled document to a document or an element (of this or another document). */
export interface OutgoingRef {
  readonly node: BaseNode;
  /** Prop (or meta/data key) holding the reference; `'of'` for transclusions. */
  readonly prop: string;
  readonly ref: Ref | RefTarget;
  /** Where it points; undefined when a handle's document is not known (reported as `ref/unresolved`). */
  readonly target: Address | undefined;
  /** Relation kind from the prop's `refSchema({ kind })`: `'link'` by default, `'include'` for transclusions. */
  readonly kind: string;
  /** Tag name the prop's schema expects the target to be (`refSchema(Theorem)`). */
  readonly expects?: string | undefined;
  /** Element ids of the referencing node and its ancestors, outermost first ("references inside this solution"). */
  readonly within: readonly string[];
  /** Human readable ancestry of the referencing node. */
  readonly path: readonly string[];
}

export interface CompileResult {
  readonly documentId: string | undefined;
  readonly root: BaseNode;
  readonly diagnostics: Diagnostic[];
  /** Declared (and string) refs → node. */
  readonly refs: ReadonlyMap<string, BaseNode>;
  /** Element id → node. */
  readonly ids: ReadonlyMap<string, BaseNode>;
  /** Content hashes by node. */
  readonly hashes: ReadonlyMap<BaseNode, string>;
  /** Derive key → value. */
  readonly derived: ReadonlyMap<string, unknown>;
  readonly outgoing: readonly OutgoingRef[];
  readonly counters: ReadonlyMap<string, number>;
  /** Results of `hooks[].finish()` by hook name. */
  readonly hooks: ReadonlyMap<string, unknown>;
}

interface Session {
  readonly options: CompileOptions;
  readonly results: Map<string, Promise<CompileResult>>;
  readonly inProgress: Set<string>;
}

//
// compile
//

/** What `compile` accepts: a document, a node, or a list of nodes (compiled as a fragment, e.g. generated content). */
export type CompileInput = Document | BaseNode | readonly AnyNode[];

function toInput(input: CompileInput): Document | BaseNode {
  return Array.isArray(input) ? makeFragment(input) : (input as Document | BaseNode);
}

export async function compile(input: CompileInput, options: CompileOptions = {}): Promise<CompileResult> {
  const session: Session = { options, results: new Map(), inProgress: new Set() };
  return compileInSession(toInput(input), options, session);
}

/**
 * A long-lived compile session: documents compiled through it share one result cache, so a document
 * transcluded by several others (`<Include of>`) is compiled once. Generators that compile on demand
 * (dev servers, incremental builds) create one session per build instead of calling `compile` per document.
 */
export interface CompileSession {
  readonly options: CompileOptions;
  /** Compile a document (cached by its corpus id when it has one) or a bare node. */
  compile(input: CompileInput, overrides?: Partial<CompileOptions>): Promise<CompileResult>;
  /** Results compiled so far, by document id. */
  readonly results: ReadonlyMap<string, Promise<CompileResult>>;
}

export function createCompileSession(options: CompileOptions = {}): CompileSession {
  const session: Session = { options, results: new Map(), inProgress: new Set() };
  return {
    options,
    results: session.results,
    compile(rawInput, overrides) {
      const input = toInput(rawInput);
      const merged: CompileOptions = overrides ? { ...options, ...overrides } : options;
      const doc = isDocument(input) ? input : undefined;
      const id = merged.documentId ?? doc?.scope.documentId;
      if (doc && id && merged.corpus?.get(id) === doc && !overrides) {
        return compileDocumentInSession(id, doc, session);
      }
      return compileInSession(input, merged, session);
    },
  };
}

/** Compile every document of a corpus sharing one session (includes resolve across documents). */
export async function compileCorpus(
  corpus: Corpus,
  options: Omit<CompileOptions, 'corpus' | 'documentId'> & {
    /** Options of the corpus index built from the results (relation kinds, dangling policy, …). */
    readonly index?: CorpusIndexOptions | undefined;
  } = {},
): Promise<{
  results: Map<string, CompileResult>;
  backRefs: Map<string, OutgoingRef[]>;
  /** Addressable elements and references of the whole corpus; its validation diagnostics are in `diagnostics`. */
  index: CorpusIndex;
  diagnostics: Diagnostic[];
}> {
  const full: CompileOptions = { ...options, corpus };
  const session: Session = { options: full, results: new Map(), inProgress: new Set() };
  const results = new Map<string, CompileResult>();
  for (const [id, doc] of corpus.entries()) {
    results.set(id, await compileDocumentInSession(id, doc, session));
  }
  const backRefs = new Map<string, OutgoingRef[]>();
  const diagnostics: Diagnostic[] = [];
  const index = new CorpusIndex(options.index);
  for (const result of results.values()) {
    diagnostics.push(...result.diagnostics);
    index.update(result);
    for (const out of result.outgoing) {
      if (!out.target) continue;
      const key = out.target.name === undefined ? out.target.documentId : `${out.target.documentId}#${out.target.name}`;
      const list = backRefs.get(key);
      if (list) list.push(out);
      else backRefs.set(key, [out]);
    }
  }
  diagnostics.push(...index.validate());
  if (full.strict && hasErrors(diagnostics)) {
    throw new TSProseError('Corpus compilation failed', diagnostics);
  }
  return { results, backRefs, index, diagnostics };
}

function compileDocumentInSession(id: string, doc: Document, session: Session): Promise<CompileResult> {
  const existing = session.results.get(id);
  if (existing) return existing;
  const promise = compileInSession(doc, { ...session.options, documentId: id }, session);
  session.results.set(id, promise);
  return promise;
}

async function compileInSession(input: Document | BaseNode, options: CompileOptions, session: Session): Promise<CompileResult> {
  const doc = isDocument(input) ? input : undefined;
  const documentId = options.documentId ?? doc?.scope.documentId;
  const bag = new DiagnosticBag();
  const slug = options.slugify ?? defaultSlugify;

  if (documentId) session.inProgress.add(documentId);

  // 1. evaluate + normalize root
  const root = evaluateDocument(input);
  normalizeRoot(root, options.kit, bag);

  // 2. include (transclusion) — before ids so copies get fresh ids
  await resolveIncludes(root, doc, options, session, bag);

  // 3. collect node diagnostics with paths
  collectNodeDiagnostics(root, bag);

  // 4. ids + hashes
  const hashes = new Map<BaseNode, string>();
  const ids = new Map<string, BaseNode>();
  assignIds(root, hashes, ids, slug, bag);

  // 5. refs: declared handles usage, string refs, outgoing links
  const refs = new Map<string, BaseNode>();
  checkRefs(root, doc, refs, bag);
  const outgoing = collectOutgoing(root, doc, documentId, options.corpus, bag);

  // 6. numbering + hooks
  const counters = applyNumbering(root, options.numbering);
  const hookResults = await runHooks(root, doc, documentId, options, bag);

  // 7. derive
  const derived = await runDerive(root, hashes, options, bag);

  if (documentId) session.inProgress.delete(documentId);

  const diagnostics = bag.items;
  if (options.strict && hasErrors(diagnostics)) {
    throw new TSProseError(`Compilation of ${documentId ?? 'document'} failed`, diagnostics);
  }
  return { documentId, root, diagnostics, refs, ids, hashes, derived, outgoing, counters, hooks: hookResults };
}

//
// Phases
//

function normalizeRoot(root: BaseNode, kit: KitRuntime | undefined, bag: DiagnosticBag): void {
  if (!root.children) return;
  const nodes = normalizeWhitespace(root.children, 'block');
  const out: AnyNode[] = [];
  let run: AnyNode[] = [];
  const flush = () => {
    if (!run.length) return;
    const wrapper = wrapperOf(kit);
    if (wrapper) {
      const trimmed = normalizeWhitespace(run, 'inline');
      if (trimmed.length) out.push(wrapper({ children: trimmed }, { pos: run[0]!.pos }) as BaseNode);
    } else {
      for (const n of run) {
        bag.error(
          'document/loose-inline',
          `Loose inline content at document root (${isTextNode(n) ? `text "${n.text.slice(0, 24)}"` : `<${n.type}>`}); wrap it in a block or compile with a kit that has wrapLooseInline`,
          n.pos,
          ['root'],
        );
      }
      out.push(...run);
    }
    run = [];
  };
  for (const segment of segmentLooseInline(nodes)) {
    if (segment.block) out.push(segment.block);
    else {
      run = segment.inline;
      flush();
    }
  }
  root.children = out.length ? out : undefined;
}

function collectNodeDiagnostics(root: BaseNode, bag: DiagnosticBag): void {
  walk(root, (node, ctx) => {
    if (isTextNode(node) || !node.diagnostics) return;
    for (const d of node.diagnostics) {
      bag.items.push({ ...d, path: d.path ?? [...ctx.path] });
    }
  });
}

function nodeHash(node: AnyNode, children: readonly string[]): string {
  if (isTextNode(node)) return hashText(`text:${node.text}`);
  return hashText(canonicalJson({ t: node.type, p: node.props, d: node.data, c: children }));
}

function assignIds(
  root: BaseNode,
  hashes: Map<BaseNode, string>,
  ids: Map<string, BaseNode>,
  slug: (s: string) => string,
  bag: DiagnosticBag,
): void {
  const textHashes = new WeakMap<AnyNode, string>();
  const hashOf = (node: AnyNode): string => {
    if (isTextNode(node)) {
      let h = textHashes.get(node);
      if (!h) {
        h = nodeHash(node, []);
        textHashes.set(node, h);
      }
      return h;
    }
    let h = hashes.get(node);
    if (!h) {
      h = nodeHash(node, (node.children ?? []).map(hashOf));
      hashes.set(node, h);
    }
    return h;
  };
  hashOf(root);

  const referable: { node: BaseNode; def: BaseDef; path: string[] }[] = [];
  walk(root, (node, ctx) => {
    if (isTextNode(node) || node.type === ROOT_TYPE) return;
    const def = getDef(node);
    if (def ? def.ref !== 'none' : node.ref !== undefined || node.id !== undefined) {
      referable.push({ node, def: def ?? { name: node.type, kind: node.kind, props: {}, children: 'any', ref: 'optional' }, path: [...ctx.path] });
    }
  });

  const take = (candidate: string, node: BaseNode): string => {
    let id = candidate;
    let n = 1;
    while (ids.has(id)) id = `${candidate}-${++n}`;
    ids.set(id, node);
    return id;
  };

  // Refs first: they own their names.
  for (const { node, path } of referable) {
    if (node.ref === undefined) continue;
    const id = slug(node.ref);
    if (!id) {
      bag.error('ref/invalid', `Ref "${node.ref}" produces an empty id`, node.pos, path);
      continue;
    }
    if (ids.has(id)) {
      const other = ids.get(id)!;
      if (other.ref !== node.ref) {
        bag.error('ref/collision', `Refs "${other.ref}" and "${node.ref}" produce the same id "${id}"`, node.pos, path);
      }
      node.id = take(id, node);
    } else {
      ids.set(id, node);
      node.id = id;
    }
  }
  // Then keyed / hashed ids.
  for (const { node, def, path } of referable) {
    if (node.ref !== undefined) continue;
    let base: string | undefined;
    const keyFn = def.key ?? getKit(node)?.defaultKey;
    if (keyFn && !hasInvalidProps(node)) {
      try {
        const key = keyFn(node);
        if (key) base = slug(key);
      } catch (error) {
        bag.error('tag/key', `<${node.type}> key() threw: ${(error as Error)?.message ?? String(error)}`, node.pos, path);
      }
    }
    if (!base) base = `${node.type}-${hashes.get(node)!.slice(0, 10)}`;
    node.id = take(base, node);
  }
}

function checkRefs(root: BaseNode, doc: Document | undefined, refs: Map<string, BaseNode>, bag: DiagnosticBag): void {
  const declared = new Map<string, Ref>();
  const scopes = new Set<RefScope>();
  if (doc) {
    scopes.add(doc.scope);
    for (const r of doc.refs) {
      scopes.add(r[REFS]);
      for (const handle of listRefs(r)) declared.set(handle.name, handle);
    }
  }
  const used = new Map<string, BaseNode[]>();
  walk(root, (node, ctx) => {
    if (isTextNode(node) || node.ref === undefined) return;
    const handle = getRefHandle(node);
    if (handle && doc && !scopes.has(handle.scope)) {
      bag.error(
        'ref/foreign',
        `Ref "${handle.name}" belongs to another document and cannot mark an element here; use <Include of> or a string "$"`,
        node.pos,
        [...ctx.path],
      );
    }
    const list = used.get(node.ref);
    if (list) list.push(node);
    else used.set(node.ref, [node]);
  });
  for (const [name, nodes] of used) {
    if (nodes.length > 1) {
      for (const node of nodes.slice(1)) {
        bag.error('ref/duplicate', `Ref "${name}" is used by ${nodes.length} elements`, node.pos);
      }
    }
    refs.set(name, nodes[0]!);
  }
  for (const [name, handle] of declared) {
    if (!used.has(name)) {
      bag.error('ref/unused', `Ref "${name}" (<${handle.def.name}>) is declared but never used in the document`);
    }
  }
}

function collectOutgoing(
  root: BaseNode,
  doc: Document | undefined,
  documentId: string | undefined,
  corpus: Corpus | undefined,
  bag: DiagnosticBag,
): OutgoingRef[] {
  const out: OutgoingRef[] = [];
  const ownScopes = new Set<RefScope>(doc ? [doc.scope, ...doc.refs.map((r) => r[REFS])] : []);
  const ownId = doc?.scope.documentId ?? documentId;
  walk(root, (node, ctx) => {
    if (isTextNode(node)) return;
    const within = [...ctx.ancestors, node].map((n) => n.id).filter((id): id is string => id !== undefined);
    const path = [...ctx.path];
    // Transcluded copy: its include reference is the outgoing reference (no diagnostics, the include phase reported).
    const includeRef = (node as unknown as Record<symbol, Ref | RefTarget | undefined>)[INCLUDE_REF];
    if (includeRef) {
      const from = node.meta.includedFrom as { documentId: string; name: string };
      out.push({ node, prop: 'of', ref: includeRef, target: { documentId: from.documentId, name: from.name }, kind: 'include', within, path });
      return;
    }
    if (node.type === Include.def.name) {
      const raw = node.props.of;
      const ref = isAddressable(raw) && !isRef(raw) && !isRefTarget(raw) ? toRefTarget(raw) : raw;
      if (isRef(ref) || isRefTarget(ref)) out.push({ node, prop: 'of', ref, target: undefined, kind: 'include', within, path });
      return;
    }
    const kinds = refPropsOfProps(getDef(node)?.props);
    const visitValue = (prop: string, raw: unknown, depth: number, top: boolean) => {
      const value = !isRef(raw) && !isRefTarget(raw) && isAddressable(raw) ? toRefTarget(raw) : raw;
      if (isRef(value)) {
        const own = ownScopes.has(value.scope);
        const targetDoc = own ? ownId : corpus ? corpus.resolve(value)?.documentId : value.scope.documentId;
        const target = targetDoc ? { documentId: targetDoc, name: value.name } : undefined;
        if (!target) {
          const where = value.scope.url ? ` (${value.scope.url})` : '';
          if (corpus || own) {
            bag.error('ref/unresolved', `Ref "${value.name}"${where} points to a document that is not in the corpus`, node.pos, path);
          } else {
            bag.warning('ref/unresolved', `Ref "${value.name}"${where} cannot be resolved without a corpus`, node.pos, path);
          }
        }
        const meta = top ? kinds[prop] : undefined;
        out.push({ node, prop, ref: value, target, kind: meta?.kind ?? 'link', expects: meta?.tag, within, path });
        return;
      }
      if (isRefTarget(value)) {
        const { documentId: id, name, params } = value.$ref;
        const target = id
          ? { documentId: id, ...(name !== undefined ? { name } : {}), ...(params !== undefined ? { params } : {}) }
          : undefined;
        if (!target) bag.error('ref/unresolved', `Reference "${name ?? '?'}" has no document id`, node.pos, path);
        const meta = top ? kinds[prop] : undefined;
        out.push({ node, prop, ref: value, target, kind: meta?.kind ?? 'link', expects: meta?.tag, within, path });
        return;
      }
      if (depth > 2 || value === null || typeof value !== 'object' || isAnyNode(value)) return;
      if (Array.isArray(value)) value.forEach((v) => visitValue(prop, v, depth + 1, top));
      else for (const v of Object.values(value as Record<string, unknown>)) visitValue(prop, v, depth + 1, top);
    };
    for (const [prop, value] of Object.entries(node.props)) visitValue(prop, value, 0, true);
    for (const [prop, value] of Object.entries(node.meta)) visitValue(prop, value, 0, false);
    if (node.data !== null && typeof node.data === 'object' && !Array.isArray(node.data) && !isAnyNode(node.data)) {
      for (const [key, value] of Object.entries(node.data as Record<string, unknown>)) visitValue(key, value, 0, false);
    }
  });
  return out;
}

async function resolveIncludes(root: BaseNode, doc: Document | undefined, options: CompileOptions, session: Session, bag: DiagnosticBag): Promise<void> {
  const includes: { node: BaseNode; parent: BaseNode; index: number; path: string[] }[] = [];
  walk(root, (node, ctx) => {
    if (!isTextNode(node) && node.type === Include.def.name && ctx.parent) {
      includes.push({ node, parent: ctx.parent, index: ctx.index, path: [...ctx.path] });
    }
  });
  if (!includes.length) return;

  const kit = options.kit;
  for (const { node, parent, index, path } of includes) {
    const raw = node.props.of;
    const ref = !isRef(raw) && !isRefTarget(raw) && isAddressable(raw) ? toRefTarget(raw) : raw;
    if (!isRef(ref) && !isRefTarget(ref)) continue; // already reported by props validation
    const corpus = options.corpus;
    const label = isRef(ref) ? ref.name : (ref.$ref.name ?? ref.$ref.documentId ?? '?');
    const own = isRef(ref)
      ? doc && (doc.scope === ref.scope || doc.refs.some((r) => r[REFS] === ref.scope))
      : ref.$ref.documentId !== undefined && ref.$ref.documentId === (doc?.scope.documentId ?? options.documentId);
    let target: CompileResult | undefined;
    if (own) {
      bag.error('include/self', `<Include> cannot include an element of its own document ("${label}")`, node.pos, path);
      continue;
    }
    if (!isRef(ref) && ref.$ref.name === undefined) {
      bag.error('include/whole-document', `<Include of="${label}"> must point to an element, not a whole document`, node.pos, path);
      continue;
    }
    const resolved = isRef(ref)
      ? corpus?.resolve(ref)
      : ref.$ref.documentId && corpus?.has(ref.$ref.documentId)
        ? { documentId: ref.$ref.documentId, name: ref.$ref.name! }
        : undefined;
    if (!resolved || !corpus) {
      bag.error('include/unresolved', `<Include of="${label}"> points to a document that is not in the corpus`, node.pos, path);
      continue;
    }
    if (session.inProgress.has(resolved.documentId)) {
      bag.error('include/cycle', `<Include of="${label}"> creates an include cycle with document "${resolved.documentId}"`, node.pos, path);
      continue;
    }
    const targetDoc = corpus.get(resolved.documentId)!;
    target = await compileDocumentInSession(resolved.documentId, targetDoc, session);
    const source = target.refs.get(resolved.name);
    if (!source) {
      bag.error('include/missing', `Document "${resolved.documentId}" has no element with ref "${resolved.name}"`, node.pos, path);
      continue;
    }
    const copy = cloneNode(source);
    walk(copy, (n) => {
      if (isTextNode(n)) return;
      n.id = undefined;
      n.ref = undefined;
      n.derived = undefined;
      n.diagnostics = undefined;
      kit?.onInclude?.(n);
      const def = getDef(n);
      if (def) Object.defineProperty(n, Symbol.for('tsprose.def'), { value: def, enumerable: false, configurable: true });
    });
    copyDefs(source, copy);
    Object.defineProperty(copy, REF_HANDLE, { value: undefined, enumerable: false, configurable: true });
    const extraMeta = (node.props.meta as Record<string, unknown> | undefined) ?? {};
    copy.meta = { ...copy.meta, ...extraMeta, includedFrom: { documentId: resolved.documentId, name: resolved.name } };
    Object.defineProperty(copy, INCLUDE_REF, { value: ref, enumerable: false, configurable: true });
    if (node.pos) copy.pos = node.pos;
    parent.children![index] = copy;
  }
}

/** cloneNode drops symbol-keyed definitions; restore them by walking both trees in lockstep. */
function copyDefs(from: AnyNode, to: AnyNode): void {
  if (isTextNode(from) || isTextNode(to)) return;
  const def = getDef(from);
  if (def) Object.defineProperty(to, Symbol.for('tsprose.def'), { value: def, enumerable: false, configurable: true });
  const kit = getKit(from);
  if (kit) Object.defineProperty(to, Symbol.for('tsprose.kit'), { value: kit, enumerable: false, configurable: true });
  const a = from.children ?? [];
  const b = to.children ?? [];
  for (let i = 0; i < a.length; i++) copyDefs(a[i]!, b[i]!);
}

function applyNumbering(root: BaseNode, numbering: Readonly<Record<string, string>> | undefined): Map<string, number> {
  const counters = new Map<string, number>();
  if (!numbering) return counters;
  walk(root, (node) => {
    if (isTextNode(node)) return;
    const counter = numbering[node.type];
    if (!counter) return;
    const n = (counters.get(counter) ?? 0) + 1;
    counters.set(counter, n);
    node.meta.number = n;
  });
  return counters;
}

async function runHooks(
  root: BaseNode,
  doc: Document | undefined,
  documentId: string | undefined,
  options: CompileOptions,
  bag: DiagnosticBag,
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  const hooks = options.hooks ?? [];
  if (!hooks.length) return results;
  const ctx: HookContext = {
    documentId,
    root,
    document: doc,
    corpus: options.corpus,
    context: options.context,
    report(code, message, node, severity = 'error') {
      const pos = node && !isTextNode(node) ? node.pos : undefined;
      if (severity === 'error') bag.error(code, message, pos);
      else bag.warning(code, message, pos);
    },
  };
  walk(root, {
    enter(node, w) {
      for (const h of hooks) h.enter?.(node, w, ctx);
    },
    leave(node, w) {
      for (const h of hooks) h.leave?.(node, w, ctx);
    },
  });
  for (const h of hooks) {
    if (h.finish) {
      try {
        results.set(h.name, await h.finish(ctx));
      } catch (error) {
        bag.error('hook/failed', `Hook "${h.name}" failed: ${(error as Error)?.message ?? String(error)}`);
      }
    }
  }
  return results;
}

async function runDerive(root: BaseNode, hashes: ReadonlyMap<BaseNode, string>, options: CompileOptions, bag: DiagnosticBag): Promise<Map<string, unknown>> {
  const derived = new Map<string, unknown>();
  const tasks: { key: string; node: BaseNode; fn: DeriveFn; path: string[] }[] = [];
  const seen = new Set<string>();
  const visitNode = (node: AnyNode, ctx: { path: readonly string[] }) => {
    if (isTextNode(node)) return;
    const override = options.derive?.[node.type];
    const def = getDef(node);
    const fn = override ?? (def?.derive as DeriveFn | undefined);
    if (!fn || hasInvalidProps(node)) return;
    // Nodes outside the tree (in data, deriveExtra) have no tree hash: key them by their full content.
    const key = `${node.type}:${hashes.get(node) ?? hashText(canonicalJson(nodeToJSON(node)))}`;
    node.derived = key;
    if (seen.has(key)) return;
    seen.add(key);
    const cached = options.derivedCache?.get(key);
    if (cached !== undefined) {
      derived.set(key, cached);
      return;
    }
    tasks.push({ key, node, fn, path: [...ctx.path] });
  };
  // The tree, nodes stored in data (at any depth, including data of those nodes), and integrator extras.
  const visited = new Set<BaseNode>();
  const queue: { node: BaseNode; prefix: readonly string[] }[] = [{ node: root, prefix: [] }];
  for (const extra of options.deriveExtra?.(root) ?? []) queue.push({ node: extra, prefix: ['extra'] });
  while (queue.length) {
    const { node: start, prefix } = queue.shift()!;
    if (visited.has(start)) continue;
    visited.add(start);
    walk(start, (node, ctx) => {
      visitNode(node, { path: [...prefix, ...ctx.path] });
      if (!isTextNode(node) && node.data !== undefined) {
        for (const inner of nodesInData(node.data)) queue.push({ node: inner, prefix: [...prefix, ...ctx.path, 'data'] });
      }
    });
  }
  if (!tasks.length) return derived;

  const limit = Math.max(1, options.concurrency ?? 8);
  let next = 0;
  const ctx: DeriveContext = { context: options.context, signal: options.signal, resolve: options.resolve };
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try {
        const value = await task.fn(task.node, ctx);
        derived.set(task.key, value === undefined ? null : value);
      } catch (error) {
        bag.error('derive/failed', `<${task.node.type}> derive failed: ${(error as Error)?.message ?? String(error)}`, task.node.pos, task.path);
        derived.set(task.key, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return derived;
}

/** Nodes whose props failed validation are not keyed or derived (their props are unreliable). */
function hasInvalidProps(node: BaseNode): boolean {
  return !!node.diagnostics?.some((d) => d.code === 'props/invalid');
}

/** Format the ancestry label of a node (utility for integrators' own diagnostics). */
export function describePath(ancestors: readonly BaseNode[], node: AnyNode): string {
  return [...ancestors.map((a, i) => labelOf(a, i, ancestors[i - 1])), labelOf(node, ancestors.length, ancestors.at(-1))].join(' > ');
}

export { walkAsync };
