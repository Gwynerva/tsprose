// Regression tests for the v2 audit: sessions, includes, addressables, hashes, corpus binding, index parity, derive.
import { describe, expect, it, vi } from 'vitest';
import {
  ADDRESS,
  Corpus,
  CorpusIndex,
  Include,
  compile,
  compileCorpus,
  createCompileSession,
  defineDocument,
  defineInline,
  defineRefs,
  deriveJSON,
  deriveKey,
  nodeFromJSON,
  nodeToJSON,
  ref,
  refSchema,
  toJSON,
  type Address,
  type BaseNode,
} from 'tsprose';
import { article, summary } from '../fixtures/documents.js';
import { P, Sec, Theorem } from '../fixtures/tags.js';

const codes = (ds: readonly { code: string }[]) => ds.map((d) => d.code);
const Link = defineInline({ name: 'link', props: { to: refSchema() }, children: 'inline' });

/** A value implementing the ADDRESS protocol. */
const addressable = (address: Address | undefined) => ({ [ADDRESS]: () => address });

describe('compile sessions', () => {
  it('concurrent compiles in one session never report false include cycles', async () => {
    const corpus = new Corpus().add('article', article).add('summary', summary);
    const session = createCompileSession({ corpus });
    const [a, b] = await Promise.all([session.compile(article), session.compile(summary)]);
    expect(codes([...a.diagnostics, ...b.diagnostics])).not.toContain('include/cycle');
  });

  it('failed compilations are not cached', async () => {
    let fail = true;
    const doc = defineDocument(() => <P>{fail ? (undefined as never as string).trim() : 'ok'}</P>, { id: 'flaky' });
    const corpus = new Corpus().add(doc);
    const session = createCompileSession({ corpus, strict: true });
    await expect(session.compile(doc)).rejects.toThrow();
    fail = false;
    expect(session.results.has('flaky')).toBe(false);
  });
});

describe('includes', () => {
  const aRefs = defineRefs({ t: Theorem });
  const a = defineDocument(() => <Theorem $={aRefs.t} title="T"><P>body</P></Theorem>, { refs: aRefs, id: 'a' });
  const bRefs = defineRefs({ s: Sec });
  const b = defineDocument(() => <Sec $={bRefs.s}><Include of={aRefs.t} /></Sec>, { refs: bRefs, id: 'b' });
  const c = defineDocument(() => <Include of={bRefs.s} />, { id: 'c' });

  it('nested includes keep their include edges', async () => {
    const { results, diagnostics } = await compileCorpus(new Corpus().add(a).add(b).add(c));
    expect(diagnostics).toEqual([]);
    const edges = results.get('c')!.outgoing.filter((o) => o.kind === 'include').map((o) => `${o.target?.documentId}#${o.target?.name}`);
    expect(edges).toEqual(['b#s', 'a#t']);
  });

  it('addressables and addresses work in <Include>; unaddressable ones are reported', async () => {
    const corpus = new Corpus().add(a);
    const viaAddressable = await compile(defineDocument(() => <Include of={addressable({ documentId: 'a', name: 't' })} />, { id: 'x' }), { corpus });
    expect(viaAddressable.diagnostics).toEqual([]);
    expect(viaAddressable.root.children?.[0]?.type).toBe('theorem');
    const broken = await compile(defineDocument(() => <Include of={addressable(undefined)} />, { id: 'y' }), { corpus });
    expect(codes(broken.diagnostics)).toEqual(['ref/unresolved']);
  });
});

describe('references', () => {
  it('an addressable without an address is reported, not silently skipped', async () => {
    const result = await compile(defineDocument(() => <P>see <Link to={addressable(undefined)}>x</Link></P>, { id: 'd' }));
    expect(codes(result.diagnostics)).toEqual(['ref/unresolved']);
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]!.target).toBeUndefined();
  });

  it('a whole-document reference cannot mark an element', async () => {
    const result = await compile(defineDocument(() => <P $={ref('doc') as never}>x</P>));
    expect(codes(result.diagnostics)).toContain('ref/invalid');
  });

  it('foreign objects shaped like { $ref } with extra keys are not references', async () => {
    const result = await compile(defineDocument(() => <P>see <Link to={{ $ref: { name: 'x', other: 1 } } as never}>x</Link></P>, { id: 'e' }));
    expect(codes(result.diagnostics)).toContain('props/invalid');
  });
});

describe('content hashes and derive keys', () => {
  it('compiled nodes and nodes restored from JSON get the same derive key', async () => {
    const result = await compile(defineDocument(() => <P>see <Link to={ref('guide/intro', 'install', { v: 2 })}>docs</Link></P>, { id: 'h' }));
    const paragraph = result.root.children![0] as BaseNode;
    const restored = nodeFromJSON(nodeToJSON(paragraph)) as BaseNode;
    expect(deriveKey(restored)).toBe(deriveKey(paragraph, result.hashes.get(paragraph)));
  });
});

describe('Corpus binding', () => {
  it('remove() unbinds, so a module can be added under another id', () => {
    const refs = defineRefs({ p: P });
    const doc = defineDocument(() => <P $={refs.p}>x</P>, { refs });
    const corpus = new Corpus().add('one', doc);
    corpus.remove('one');
    expect(refs.p.scope.documentId).toBeUndefined();
    corpus.add('two', doc);
    expect(refs.p.scope.documentId).toBe('two');
  });

  it('documents with their own id keep it across remove/add; set() validates before replacing', () => {
    const doc = defineDocument(() => <P>x</P>, { id: 'own' });
    const corpus = new Corpus().add(doc);
    corpus.remove('own');
    corpus.add(doc);
    expect(corpus.ids()).toEqual(['own']);
    const other = defineDocument(() => <P>y</P>, { id: 'elsewhere' });
    expect(() => corpus.set('own', other)).toThrow(/already bound/);
    expect(corpus.get('own')).toBe(doc);
  });

  it('every refs object of a document must agree on the id', () => {
    const first = defineRefs({ p: P });
    const second = defineRefs({ q: P });
    defineDocument(() => <P $={first.p}>x</P>, { refs: first, id: 'first' });
    expect(() => defineDocument(() => <P>y</P>, { refs: [first, second], id: 'other' })).toThrow(/different documents/);
  });
});

describe('CorpusIndex from JSON', () => {
  it('matches update() for the same document (targets, edges, enclosing elements)', async () => {
    const doc = defineDocument(
      () => (
        <Sec $="part">
          <P $="lead">
            see <Link to={ref('other', 'x')}>x</Link>
          </P>
        </Sec>
      ),
      { id: 'parity' },
    );
    const result = await compile(doc);
    const compiled = new CorpusIndex().update(result).get('parity')!;
    const fromJson = new CorpusIndex().updateFromJSON(toJSON(result)).get('parity')!;
    expect([...fromJson.targets.values()]).toEqual([...compiled.targets.values()]);
    const strip = (e: { target: Address; within: readonly string[]; path: readonly string[]; kind: string }) => ({ target: e.target, within: e.within, path: e.path, kind: e.kind });
    expect(fromJson.edges.map(strip)).toEqual(compiled.edges.map(strip));
  });
});

describe('deriveJSON', () => {
  it('reports failures through onError and does not cache them', async () => {
    const Thing = defineInline({ name: 'thing', props: { n: refSchema() } });
    const result = await compile(defineDocument(() => <P><Thing n={ref('a')} /></P>, { id: 'dj' }));
    const cache = new Map<string, unknown>();
    const onError = vi.fn();
    const json = await deriveJSON(toJSON(result), { thing: () => { throw new Error('nope'); } }, { cache, onError });
    expect(onError).toHaveBeenCalledOnce();
    expect(Object.values(json.derived ?? {})).toEqual([null]);
    expect(cache.size).toBe(0);
  });
});
