import { normalizeWhitespace, segmentLooseInline } from './children.js';
import type { Corpus } from './corpus.js';
import { CorpusIndex, type CorpusIndexOptions, type ResolveFn } from './corpus-index.js';
import type { BaseDef, DeriveContext } from './def.js';
import { DiagnosticBag, TSProseError, hasErrors, type Diagnostic, type Severity } from './diagnostics.js';
import { evaluateDocument, isDocument, ROOT_TYPE, type Document } from './document.js';
import { attachDef, getDef, getKit, getRefHandle, makeFragment } from './element.js';
import { contentHash, deriveKey } from './json.js';
import { wrapperOf, type KitRuntime } from './kit.js';
import { isTextNode, type AnyNode, type BaseNode } from './node.js';
import {
  REFS,
  addressOf,
  isRef,
  isReferenceValue,
  listRefs,
  referenceLabel,
  refSchema,
  toRefTarget,
  type Address,
  type Ref,
  type RefScope,
  type RefTarget,
} from './ref.js';
import { slugify as defaultSlugify } from './slugify.js';
import { refPropsOfProps, s } from './standard.js';
import { defineBlock } from './tag.js';
import { errorMessage, runPool } from './util.js';
import { cloneNode, forEachReference, nodesInData, walk, type WalkContext } from './walk.js';

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

/** Non-enumerable marker on transcluded copies: the reference they were included through. */
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
  /** Report a diagnostic; with a node, its position and path (when visited by the walk) are attached. */
  report(code: string, message: string, node?: AnyNode, severity?: Severity): void;
}

/**
 * Integrator hook: one walk over the compiled tree after ids, refs, outgoing references and numbering are known,
 * before derive. `enter`/`leave` run per node; `finish` returns the hook's result (`result.hooks.get(name)`).
 */
export interface Hook<R = unknown> {
  readonly name: string;
  enter?(node: AnyNode, walk: WalkContext, ctx: HookContext): void;
  leave?(node: AnyNode, walk: WalkContext, ctx: HookContext): void;
  finish?(ctx: HookContext): R | Promise<R>;
}

/** Identity helper that infers the hook's result type. */
export function defineHook<R>(hook: Hook<R>): Hook<R> {
  return hook;
}

//
// Options and result
//

/** A derive function: computes a node's derived value (cached by the node's content, see `deriveKey`). */
export type DeriveFn = (node: BaseNode, ctx: DeriveContext) => unknown;

export interface CompileOptions {
  /** Documents that `<Include>` and handles resolve against. */
  readonly corpus?: Corpus | undefined;
  /** Document id when compiling without a corpus (or to override the document's own id). */
  readonly documentId?: string | undefined;
  /** Kit whose `wrapLooseInline` wraps loose inline content at the document root. */
  readonly kit?: KitRuntime | undefined;
  /** Turns ref names and keys into element ids (default: `slugify`). */
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
  /** Opaque integrator context (`ctx.context` in hooks and derive functions). */
  readonly context?: unknown;
  /**
   * Resolve references from derive functions (`ctx.resolve(ref)`), e.g. `index.resolver()` of a {@link CorpusIndex}
   * built by an earlier pass. Derive values that depend on other documents are usually better computed at serve time
   * with `deriveJSON`, when the whole corpus is known.
   */
  readonly resolve?: ResolveFn | undefined;
  /** Derive functions running at once (default 8). */
  readonly concurrency?: number | undefined;
  /** Stops starting new derive tasks once aborted. */
  readonly signal?: AbortSignal | undefined;
  /** Throw a TSProseError when any error-level diagnostic exists. */
  readonly strict?: boolean | undefined;
}

/** A reference from a compiled document to a document or an element (of this or another document). */
export interface OutgoingRef {
  readonly node: BaseNode;
  /** Prop (or meta/data key) holding the reference; `'of'` for transclusions. */
  readonly prop: string;
  /** The reference as written: a handle, or the serialized form of an address / addressable. */
  readonly ref: Ref | RefTarget;
  /** Where it points; undefined when unresolvable (reported as `ref/unresolved`). */
  readonly target: Address | undefined;
  /** Relation kind from the prop's `refSchema({ kind })`: `'link'` by default, `'include'` for transclusions. */
  readonly kind: string;
  /** Tag name the prop's schema expects the target to be (`refSchema(Theorem)`). */
  readonly expects?: string | undefined;
  /** Element ids of the referencing node and its ancestors, outermost first ("references inside this section"). */
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
  /** Content hashes by node (see `contentHash`). */
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
  /** Results of documents compiled with the session options, by document id. */
  readonly results: Map<string, Promise<CompileResult>>;
}

//
// compile
//

/** What `compile` accepts: a document, a node, or a list of nodes (compiled as a fragment, e.g. generated content). */
export type CompileInput = Document | BaseNode | readonly AnyNode[];

function toInput(input: CompileInput): Document | BaseNode {
  return Array.isArray(input) ? makeFragment(input) : (input as Document | BaseNode);
}

/**
 * Compile a document (or nodes): normalize the root → resolve `<Include>`s → collect diagnostics → ids and content
 * hashes → refs and outgoing references → numbering and hooks → derive. Never throws unless `strict`.
 */
export async function compile(input: CompileInput, options: CompileOptions = {}): Promise<CompileResult> {
  const session: Session = { options, results: new Map() };
  return compileInSession(toInput(input), options, session, []);
}

/**
 * A long-lived compile session: documents compiled through it share one result cache, so a document
 * transcluded by several others (`<Include of>`) is compiled once. Generators that compile on demand
 * (dev servers, incremental builds) create one session per build instead of calling `compile` per document.
 */
export interface CompileSession {
  readonly options: CompileOptions;
  /**
   * Compile a document or nodes. A corpus document compiled with the session options is cached by its id;
   * `overrides` (or a bare node) bypass the cache — the result is fresh and not stored.
   */
  compile(input: CompileInput, overrides?: Partial<CompileOptions>): Promise<CompileResult>;
  /** Results compiled so far, by document id. */
  readonly results: ReadonlyMap<string, Promise<CompileResult>>;
}

export function createCompileSession(options: CompileOptions = {}): CompileSession {
  const session: Session = { options, results: new Map() };
  return {
    options,
    results: session.results,
    compile(rawInput, overrides) {
      const input = toInput(rawInput);
      const merged: CompileOptions = overrides ? { ...options, ...overrides } : options;
      const doc = isDocument(input) ? input : undefined;
      const id = merged.documentId ?? doc?.scope.documentId;
      if (doc && id && merged.corpus?.get(id) === doc && !overrides) {
        return compileDocumentInSession(id, doc, session, []);
      }
      return compileInSession(input, merged, session, []);
    },
  };
}

/**
 * Compile every document of a corpus sharing one session (includes resolve across documents) and index the
 * results; the index's validation (broken references) is part of `diagnostics`.
 */
export async function compileCorpus(
  corpus: Corpus,
  options: Omit<CompileOptions, 'corpus' | 'documentId'> & {
    /** Options of the corpus index built from the results (relation kinds, dangling policy, …). */
    readonly index?: CorpusIndexOptions | undefined;
  } = {},
): Promise<{
  results: Map<string, CompileResult>;
  /** Addressable elements and references of the whole corpus (`index.incoming(…)` for back references). */
  index: CorpusIndex;
  diagnostics: Diagnostic[];
}> {
  const full: CompileOptions = { ...options, corpus };
  const session: Session = { options: full, results: new Map() };
  const results = new Map<string, CompileResult>();
  for (const [id, doc] of corpus.entries()) {
    results.set(id, await compileDocumentInSession(id, doc, session, []));
  }
  const diagnostics: Diagnostic[] = [];
  const index = new CorpusIndex(options.index);
  for (const result of results.values()) {
    diagnostics.push(...result.diagnostics);
    index.update(result);
  }
  diagnostics.push(...index.validate());
  if (full.strict && hasErrors(diagnostics)) {
    throw new TSProseError('Corpus compilation failed', diagnostics);
  }
  return { results, index, diagnostics };
}

/** Cached compile of a corpus document with the session options. Failed compilations are not cached. */
function compileDocumentInSession(id: string, doc: Document, session: Session, chain: readonly string[]): Promise<CompileResult> {
  const existing = session.results.get(id);
  if (existing) return existing;
  const promise = compileInSession(doc, { ...session.options, documentId: id }, session, chain);
  session.results.set(id, promise);
  promise.catch(() => {
    if (session.results.get(id) === promise) session.results.delete(id);
  });
  return promise;
}

/**
 * @param chain Documents currently including this one (outermost first): an include of any of them is a cycle.
 * Kept per include chain, so concurrent compiles in one session never see each other as cycles.
 */
async function compileInSession(
  input: Document | BaseNode,
  options: CompileOptions,
  session: Session,
  chain: readonly string[],
): Promise<CompileResult> {
  const doc = isDocument(input) ? input : undefined;
  const documentId = ownDocumentId(doc, options);
  const bag = new DiagnosticBag();
  const slug = options.slugify ?? defaultSlugify;

  // 1. evaluate + normalize root
  const root = evaluateDocument(input);
  normalizeRoot(root, options.kit, bag);

  // 2. include (transclusion) — before ids so copies get fresh ids
  await resolveIncludes(root, doc, documentId, options, session, documentId ? [...chain, documentId] : chain, bag);

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

  const diagnostics = bag.items;
  if (options.strict && hasErrors(diagnostics)) {
    throw new TSProseError(`Compilation of ${documentId ?? 'document'} failed`, diagnostics);
  }
  return { documentId, root, diagnostics, refs, ids, hashes, derived, outgoing, counters, hooks: hookResults };
}

/** The compiled document's id: the explicit option wins over the document's own (corpus-bound) id. */
function ownDocumentId(doc: Document | undefined, options: CompileOptions): string | undefined {
  return options.documentId ?? doc?.scope.documentId;
}

/** Ref scopes owned by a document: its own scope and the scopes of its refs objects. */
function ownScopes(doc: Document | undefined): Set<RefScope> {
  return new Set(doc ? [doc.scope, ...doc.refs.map((r) => r[REFS])] : []);
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
        h = contentHash(node);
        textHashes.set(node, h);
      }
      return h;
    }
    let h = hashes.get(node);
    if (!h) {
      h = contentHash(node, (node.children ?? []).map(hashOf));
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
        bag.error('tag/key', `<${node.type}> key() threw: ${errorMessage(error)}`, node.pos, path);
      }
    }
    if (!base) base = `${node.type}-${hashes.get(node)!.slice(0, 10)}`;
    node.id = take(base, node);
  }
}

function checkRefs(root: BaseNode, doc: Document | undefined, refs: Map<string, BaseNode>, bag: DiagnosticBag): void {
  const declared = new Map<string, Ref>();
  const scopes = ownScopes(doc);
  for (const r of doc?.refs ?? []) {
    for (const handle of listRefs(r)) declared.set(handle.name, handle);
  }
  const used = new Map<string, { node: BaseNode; path: string[] }[]>();
  walk(root, (node, ctx) => {
    if (isTextNode(node) || node.ref === undefined) return;
    const path = [...ctx.path];
    const handle = getRefHandle(node);
    if (handle && doc && !scopes.has(handle.scope)) {
      bag.error(
        'ref/foreign',
        `Ref "${handle.name}" belongs to another document and cannot mark an element here; use <Include of> or a string "$"`,
        node.pos,
        path,
      );
    }
    const list = used.get(node.ref);
    if (list) list.push({ node, path });
    else used.set(node.ref, [{ node, path }]);
  });
  for (const [name, uses] of used) {
    for (const { node, path } of uses.slice(1)) {
      bag.error('ref/duplicate', `Ref "${name}" is used by ${uses.length} elements`, node.pos, path);
    }
    refs.set(name, uses[0]!.node);
  }
  for (const [name, handle] of declared) {
    if (!used.has(name)) {
      const where = handle.scope.url ? ` (declared in ${handle.scope.url})` : '';
      bag.error('ref/unused', `Ref "${name}" (<${handle.def.name}>) is declared but never used in the document${where}`);
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
  const scopes = ownScopes(doc);
  walk(root, (node, ctx) => {
    if (isTextNode(node)) return;
    const within = [...ctx.ancestors, node].map((n) => n.id).filter((id): id is string => id !== undefined);
    const path = [...ctx.path];
    const push = (prop: string, ref: Ref | RefTarget, target: Address | undefined, kind: string, expects?: string) =>
      out.push({ node, prop, ref, target, kind, expects, within, path });

    // Transcluded copy: its include reference is an outgoing reference (the include phase reported problems);
    // the copy's own props are scanned below like any node's.
    const included = (node as unknown as Record<symbol, Ref | RefTarget | undefined>)[INCLUDE_REF];
    if (included) {
      const from = node.meta.includedFrom as { documentId: string; name: string };
      push('of', included, { documentId: from.documentId, name: from.name }, 'include');
    }
    if (node.type === Include.def.name) {
      // An unresolved <Include> (resolved ones were replaced by their copies).
      const value = node.props.of;
      if (isReferenceValue(value)) push('of', isRef(value) ? value : toRefTarget(value), undefined, 'include');
      return;
    }

    const kinds = refPropsOfProps(getDef(node)?.props);
    forEachReference(node, (prop, value, inProps) => {
        const meta = inProps ? kinds[prop] : undefined;
        let target: Address | undefined;
        if (isRef(value)) {
          const own = scopes.has(value.scope);
          const targetDoc = own ? documentId : corpus ? corpus.resolve(value)?.documentId : value.scope.documentId;
          target = targetDoc ? { documentId: targetDoc, name: value.name } : undefined;
          if (!target) {
            const where = value.scope.url ? ` (${value.scope.url})` : '';
            if (own) {
              bag.error('ref/unresolved', `Ref "${value.name}" belongs to this document, which has no id (compile it with a documentId or in a corpus)`, node.pos, path);
            } else if (corpus) {
              bag.error('ref/unresolved', `Ref "${value.name}"${where} points to a document that is not in the corpus`, node.pos, path);
            } else {
              bag.warning('ref/unresolved', `Ref "${value.name}"${where} cannot be resolved without a corpus`, node.pos, path);
            }
          }
        } else {
          target = addressOf(value);
          if (!target) bag.error('ref/unresolved', `Reference "${referenceLabel(value)}" has no address`, node.pos, path);
        }
        push(prop, isRef(value) ? value : toRefTarget(value), target, meta?.kind ?? 'link', meta?.tag);
    });
  });
  return out;
}

async function resolveIncludes(
  root: BaseNode,
  doc: Document | undefined,
  documentId: string | undefined,
  options: CompileOptions,
  session: Session,
  chain: readonly string[],
  bag: DiagnosticBag,
): Promise<void> {
  const includes: { node: BaseNode; parent: BaseNode; index: number; path: string[] }[] = [];
  walk(root, (node, ctx) => {
    if (!isTextNode(node) && node.type === Include.def.name && ctx.parent) {
      includes.push({ node, parent: ctx.parent, index: ctx.index, path: [...ctx.path] });
    }
  });
  if (!includes.length) return;

  const corpus = options.corpus;
  const scopes = ownScopes(doc);
  for (const { node, parent, index, path } of includes) {
    const value = node.props.of;
    if (!isReferenceValue(value)) continue; // reported by props validation
    const label = referenceLabel(value);
    const address = isRef(value) ? corpus?.resolve(value) : addressOf(value);
    const own = isRef(value) ? scopes.has(value.scope) : !!address && address.documentId === documentId;
    if (own) {
      bag.error('include/self', `<Include> cannot include an element of its own document ("${label}")`, node.pos, path);
      continue;
    }
    if (!isRef(value) && !address) {
      bag.error('ref/unresolved', `<Include of="${label}"> has no address`, node.pos, path);
      continue;
    }
    if (address && address.name === undefined) {
      bag.error('include/whole-document', `<Include of="${label}"> must point to an element, not a whole document`, node.pos, path);
      continue;
    }
    const targetDoc = address ? corpus?.get(address.documentId) : undefined;
    if (!address || !targetDoc) {
      bag.error('include/unresolved', `<Include of="${label}"> points to a document that is not in the corpus`, node.pos, path);
      continue;
    }
    const name = address.name!;
    if (chain.includes(address.documentId)) {
      bag.error('include/cycle', `<Include of="${label}"> creates an include cycle with document "${address.documentId}"`, node.pos, path);
      continue;
    }
    let target: CompileResult;
    try {
      target = await compileDocumentInSession(address.documentId, targetDoc, session, chain);
    } catch (error) {
      bag.error('include/failed', `<Include of="${label}">: document "${address.documentId}" failed to compile: ${errorMessage(error)}`, node.pos, path);
      continue;
    }
    const source = target.refs.get(name);
    if (!source) {
      bag.error('include/missing', `Document "${address.documentId}" has no element with ref "${name}"`, node.pos, path);
      continue;
    }
    const copy = cloneNode(source);
    copyHidden(source, copy);
    walk(copy, (n) => {
      if (isTextNode(n)) return;
      n.id = undefined;
      n.ref = undefined;
      n.derived = undefined;
      n.diagnostics = undefined;
      (getKit(n) ?? options.kit)?.onInclude?.(n);
    });
    const extraMeta = (node.props.meta as Record<string, unknown> | undefined) ?? {};
    copy.meta = { ...copy.meta, ...extraMeta, includedFrom: { documentId: address.documentId, name } };
    Object.defineProperty(copy, INCLUDE_REF, { value: isRef(value) ? value : toRefTarget(value), enumerable: false, configurable: true });
    if (node.pos) copy.pos = node.pos;
    parent.children![index] = copy;
  }
}

/**
 * `cloneNode` copies enumerable data only; restore definitions, kits and include markers (nested transclusions)
 * by walking both trees in lockstep.
 */
function copyHidden(from: AnyNode, to: AnyNode): void {
  if (isTextNode(from) || isTextNode(to)) return;
  const def = getDef(from);
  if (def) attachDef(to, def, getKit(from));
  const included = (from as unknown as Record<symbol, unknown>)[INCLUDE_REF];
  if (included) Object.defineProperty(to, INCLUDE_REF, { value: included, enumerable: false, configurable: true });
  const a = from.children ?? [];
  const b = to.children ?? [];
  for (let i = 0; i < a.length; i++) copyHidden(a[i]!, b[i]!);
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
  const paths = new WeakMap<AnyNode, readonly string[]>();
  const ctx: HookContext = {
    documentId,
    root,
    document: doc,
    corpus: options.corpus,
    context: options.context,
    report(code, message, node, severity = 'error') {
      const pos = node && !isTextNode(node) ? node.pos : undefined;
      const path = node ? paths.get(node) : undefined;
      if (severity === 'error') bag.error(code, message, pos, path);
      else bag.warning(code, message, pos, path);
    },
  };
  walk(root, {
    enter(node, w) {
      paths.set(node, [...w.path]);
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
        bag.error('hook/failed', `Hook "${h.name}" failed: ${errorMessage(error)}`);
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
    // Nodes outside the tree (in data, deriveExtra) have no tree hash: their content hash is computed.
    const key = deriveKey(node, hashes.get(node));
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

  const ctx: DeriveContext = { context: options.context, signal: options.signal, resolve: options.resolve };
  await runPool(
    tasks,
    options.concurrency,
    async (task) => {
      try {
        const value = await task.fn(task.node, ctx);
        derived.set(task.key, value === undefined ? null : value);
      } catch (error) {
        bag.error('derive/failed', `<${task.node.type}> derive failed: ${errorMessage(error)}`, task.node.pos, task.path);
        derived.set(task.key, null);
      }
    },
    options.signal,
  );
  return derived;
}

/** Nodes whose props failed validation are not keyed or derived (their props are unreliable). */
function hasInvalidProps(node: BaseNode): boolean {
  return !!node.diagnostics?.some((d) => d.code === 'props/invalid');
}
