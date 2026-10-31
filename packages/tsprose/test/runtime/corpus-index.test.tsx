import { describe, expect, it } from 'vitest';
import {
  Corpus,
  CorpusIndex,
  Include,
  addressKey,
  compile,
  compileCorpus,
  defineBlock,
  defineDocument,
  defineInline,
  defineRefs,
  deriveJSON,
  generateRegistryTypes,
  parseAddress,
  ref,
  refMetaOf,
  refPropsOfProps,
  refSchema,
  registryEntriesFromCorpus,
  s,
  toJSON,
  type BaseNode,
} from 'tsprose';
import { P, Theorem } from '../fixtures/tags.js';

const codes = (ds: readonly { code: string }[]) => ds.map((d) => d.code);

// Tags of a small problem book: problems with solutions, theorems, links and a "generalizes" relation.
const Link = defineInline({ name: 'link', props: { to: refSchema() }, children: 'inline' });
const Uses = defineInline({ name: 'uses', props: { theorem: refSchema(Theorem, { kind: 'uses' }) } });
const Solution = defineBlock({ name: 'solution', children: 'block', ref: 'optional' });
const Problem = defineBlock({
  name: 'problem',
  children: 'block',
  ref: 'optional',
  props: { generalizes: s.optional(refSchema({ kind: 'generalizes' })) },
});

const refTheorem = defineDocument(
  () => (
    <>
      <Theorem $="lagrange" title="Lagrange">
        <P>Statement.</P>
      </Theorem>
      <P $="note">A note.</P>
    </>
  ),
  { id: 'ref/lagrange' },
);

const p1 = defineDocument(
  () => (
    <Problem $="statement">
      <P>Find the limit.</P>
      <Solution $="solution">
        <P>
          By <Uses theorem={ref('ref/lagrange', 'lagrange')} /> and <Link to={ref('dem/2', 'statement', { seed: 3 })}>problem 2</Link>.
        </P>
      </Solution>
    </Problem>
  ),
  { id: 'dem/1' },
);

const p2 = defineDocument(
  () => (
    <Problem $="statement" generalizes={ref('dem/1')}>
      <P>
        See <Link to={ref('dem/1', 'solution')}>the solution of 1</Link>.
      </P>
      <Include of={ref('ref/lagrange', 'lagrange')} />
    </Problem>
  ),
  { id: 'dem/2' },
);

const p3 = defineDocument(
  () => (
    <>
      <P>
        Broken: <Link to={ref('dem/999', 'statement')}>missing doc</Link>, <Link to={ref('dem/1', 'nope')}>missing name</Link>,{' '}
        <Uses theorem={ref('ref/lagrange', 'note')} />, <Link to={ref('ext:wiki/Limit')}>external</Link>.
      </P>
    </>
  ),
  { id: 'dem/3' },
);

function corpus() {
  return new Corpus().add(refTheorem).add(p1).add(p2);
}

describe('refSchema metadata', () => {
  it('records kind and expected tag, through wrappers and object schemas', () => {
    expect(refMetaOf(refSchema())).toEqual({ kind: 'link', tag: undefined });
    expect(refMetaOf(s.optional(refSchema(Theorem, { kind: 'uses' })))).toEqual({ kind: 'uses', tag: 'theorem' });
    expect(refMetaOf(s.array(refSchema({ kind: 'see' })))?.kind).toBe('see');
    expect(refMetaOf(s.union(s.string(), refSchema({ kind: 'cite' })))?.kind).toBe('cite');
    expect(refPropsOfProps({ to: refSchema(), title: s.string() })).toEqual({ to: { kind: 'link', tag: undefined } });
    const whole = s.exclusive(s.object({ to: refSchema({ kind: 'a' }) }), s.object({ href: s.string() }));
    expect(refPropsOfProps(whole)).toEqual({ to: { kind: 'a', tag: undefined } });
    expect(refMetaOf(Include.def.props.of)?.kind).toBe('include');
  });
});

describe('addresses', () => {
  it('ref() builds serialized references; keys are canonical', () => {
    expect(ref('dem/1')).toEqual({ $ref: { documentId: 'dem/1' } });
    expect(ref('dem/1', 'solution', { seed: 3, a: 1 })).toEqual({ $ref: { documentId: 'dem/1', name: 'solution', params: { seed: 3, a: 1 } } });
    expect(addressKey({ documentId: 'dem/1', name: 'solution', params: { seed: 3, a: 1 } })).toBe('dem/1#solution?{"a":1,"seed":3}');
    expect(parseAddress('dem/1#solution')).toEqual({ documentId: 'dem/1', name: 'solution' });
    expect(parseAddress('dem/1')).toEqual({ documentId: 'dem/1' });
    expect(() => ref('')).toThrow();
  });

  it('defineDocument({ id }) is used by corpus.add; set() replaces, remove() removes', () => {
    const c = new Corpus().add(p1);
    expect(c.ids()).toEqual(['dem/1']);
    expect(() => c.add('other', p1)).toThrow(/already bound/);
    const again = defineDocument(() => <P>v2</P>, { id: 'dem/1' });
    expect(() => c.add(again)).toThrow(/already taken/);
    c.set('dem/1', again);
    expect(c.get('dem/1')).toBe(again);
    expect(c.remove('dem/1')).toBe(true);
    expect(c.has('dem/1')).toBe(false);
  });
});

describe('outgoing references', () => {
  it('carry kind, expected tag, params and the enclosing elements', async () => {
    const result = await compile(p1);
    expect(result.diagnostics).toEqual([]);
    expect(result.outgoing.map((o) => ({ kind: o.kind, expects: o.expects, target: o.target, within: o.within }))).toEqual([
      { kind: 'uses', expects: 'theorem', target: { documentId: 'ref/lagrange', name: 'lagrange' }, within: ['statement', 'solution', expect.stringMatching(/^paragraph-/)] },
      { kind: 'link', expects: undefined, target: { documentId: 'dem/2', name: 'statement', params: { seed: 3 } }, within: ['statement', 'solution', expect.stringMatching(/^paragraph-/)] },
    ]);
  });

  it('Include accepts addresses', async () => {
    const result = await compile(p2, { corpus: corpus() });
    expect(result.diagnostics).toEqual([]);
    const include = result.outgoing.find((o) => o.kind === 'include')!;
    expect(include.target).toEqual({ documentId: 'ref/lagrange', name: 'lagrange' });
    const whole = await compile(defineDocument(() => <Include of={ref('ref/lagrange')} />, { id: 'x' }), { corpus: corpus() });
    expect(codes(whole.diagnostics)).toContain('include/whole-document');
  });
});

describe('CorpusIndex', () => {
  async function build(extra: Parameters<typeof compileCorpus>[1] = {}) {
    const c = corpus().add(p3);
    return compileCorpus(c, extra);
  }

  it('validates references: missing documents, missing elements, wrong tags', async () => {
    const { diagnostics } = await build();
    expect(codes(diagnostics).sort()).toEqual(['ref/missing-document', 'ref/missing-document', 'ref/missing-target', 'ref/type-mismatch']);
    const mismatch = diagnostics.find((d) => d.code === 'ref/type-mismatch')!;
    expect(mismatch.message).toContain('expects <theorem>, but the element is <paragraph>');
    expect(mismatch.path?.[0]).toBe('root');
  });

  it('dangling policy decides per edge (stubs, external namespaces)', async () => {
    const { diagnostics } = await build({
      index: { dangling: (edge) => (edge.target.documentId.startsWith('ext:') ? 'ignore' : edge.target.documentId === 'dem/999' ? 'warning' : 'error') },
    });
    expect(diagnostics.map((d) => `${d.severity} ${d.code}`).sort()).toEqual([
      'error ref/missing-target',
      'error ref/type-mismatch',
      'warning ref/missing-document',
    ]);
  });

  it('answers incoming / outgoing-within / resolve', async () => {
    const { index } = await build();
    expect(index.incoming('dem/1').map((e) => `${e.from} ${e.kind}`).sort()).toEqual(['dem/2 generalizes', 'dem/2 link', 'dem/3 link']);
    expect(index.incoming({ documentId: 'dem/1', name: 'solution' }).map((e) => e.from)).toEqual(['dem/2']);
    expect(index.incoming('ref/lagrange', { kinds: ['uses'] }).map((e) => e.from).sort()).toEqual(['dem/1', 'dem/3']);
    expect(index.outgoing('dem/1', 'solution').map((e) => e.kind)).toEqual(['uses', 'link']);
    expect(index.outgoing('dem/1', 'statement')).toHaveLength(2);
    const resolved = index.resolve(ref('dem/1', 'solution'))!;
    expect(resolved.target).toMatchObject({ name: 'solution', type: 'solution', id: 'solution' });
    expect(index.resolve(ref('dem/1'))!.target).toBeUndefined();
    expect(index.resolve(ref('dem/1', 'nope'))).toBeUndefined();
  });

  it('affected(): include → recompile (transitively), link → rederive, policy none → revalidate', async () => {
    const { index } = await build({ index: { kinds: { generalizes: 'none' } } });
    // dem/4 includes dem/2's statement: a change of ref/lagrange recompiles dem/2 and, through it, dem/4.
    index.set('dem/4', { edges: [{ source: 'include', prop: 'of', kind: 'include', target: { documentId: 'dem/2', name: 'statement' }, within: [], path: [] }] });
    expect(Object.fromEntries(index.affected(['ref/lagrange']))).toEqual({ 'dem/1': 'rederive', 'dem/2': 'recompile', 'dem/3': 'rederive', 'dem/4': 'recompile' });
    expect(Object.fromEntries(index.affected(['dem/1']))).toEqual({ 'dem/2': 'rederive', 'dem/3': 'rederive' });
    const onlyRelation = new CorpusIndex({ kinds: { generalizes: 'none' } });
    onlyRelation.set('a', { edges: [{ source: 'problem', prop: 'generalizes', kind: 'generalizes', target: { documentId: 'b' }, within: [], path: [] }] });
    expect(Object.fromEntries(onlyRelation.affected(['b']))).toEqual({ a: 'revalidate' });
  });

  it('virtual documents, aliases and removal', async () => {
    const { index } = await build();
    index.declare('ext:wiki/Limit');
    index.declare('section/limits', { names: { intro: 'paragraph' } });
    index.alias('dem/999', 'dem/2');
    expect(codes(index.validate()).sort()).toEqual(['ref/missing-target', 'ref/type-mismatch']);
    expect(index.resolve(ref('dem/999', 'statement'))!.address.documentId).toBe('dem/2');
    expect(index.resolve(ref('section/limits', 'intro'))).toBeDefined();
    expect(index.resolve(ref('section/limits', 'other'))).toBeUndefined();
    expect(index.incoming('dem/2').map((e) => e.from).sort()).toEqual(['dem/1', 'dem/3']);
    expect(() => index.alias('dem/2', 'dem/999')).toThrow(/is a document/);
    index.alias('old/a', 'old/b');
    expect(() => index.alias('old/b', 'old/a')).toThrow(/cycle/);
    index.remove('dem/2');
    expect(codes(index.validate(['dem/1']))).toEqual(['ref/missing-document']);
    // Referrers survive removal (re-adding the document affects them); aliases to it are dropped.
    expect([...index.affected(['dem/2']).keys()].sort()).toEqual(['dem/1']);
    expect(index.canonicalId('dem/999')).toBe('dem/999');
  });

  it('round-trips through JSON and indexes serialized prose', async () => {
    const { index, results } = await build();
    index.declare('section/limits', { names: { intro: 'paragraph' } });
    index.alias('old/1', 'dem/1');
    const restored = CorpusIndex.fromJSON(JSON.parse(JSON.stringify(index.toJSON())));
    expect(restored.toJSON()).toEqual(JSON.parse(JSON.stringify(index.toJSON())));
    expect(codes(restored.validate())).toEqual(codes(index.validate()));

    const fromJson = new CorpusIndex();
    for (const result of results.values()) fromJson.updateFromJSON(toJSON(result));
    expect(fromJson.get('dem/2')!.edges.map((e) => `${e.kind} ${addressKey(e.target)}`)).toEqual([
      'link dem/1',
      'link dem/1#solution',
      'include ref/lagrange#lagrange',
    ]);
    expect([...fromJson.get('dem/1')!.targets.keys()]).toEqual(['statement', 'solution']);
  });

  it('custom names make other elements addressable', async () => {
    const index = new CorpusIndex({ name: (node) => node.ref ?? (node.type === 'paragraph' ? node.id : undefined) });
    index.update(await compile(p1));
    expect([...index.get('dem/1')!.targets.values()].map((t) => t.type)).toEqual(['problem', 'paragraph', 'solution', 'paragraph']);
  });
});

describe('registry types', () => {
  it('generates CorpusRegistry augmentation from index or corpus', async () => {
    const { index } = await compileCorpus(corpus());
    const text = generateRegistryTypes(index.registryEntries());
    expect(text).toContain(`declare module "tsprose" {`);
    expect(text).toContain(`"dem/1": { "solution": "solution"; "statement": "problem"; };`);
    expect(text).toContain(`"ref/lagrange": { "lagrange": "theorem"; "note": "paragraph"; };`);

    const handles = defineRefs({ pythagoras: Theorem, intro: P });
    const doc = defineDocument(() => [<P $={handles.intro}>x</P>, <Theorem $={handles.pythagoras} title="P">y</Theorem>], { refs: handles });
    expect(registryEntriesFromCorpus(new Corpus().add('article', doc))).toEqual([{ id: 'article', names: { pythagoras: 'theorem', intro: 'paragraph' } }]);
    expect(generateRegistryTypes([], { module: 'my-site', interfaceName: 'Pages' })).toContain('declare module "my-site" {\n  interface Pages {');
  });
});

describe('resolve in derive functions', () => {
  it('compile({ resolve }) and deriveJSON({ resolve }) expose ctx.resolve', async () => {
    const { index } = await compileCorpus(corpus());
    const Title = defineInline({ name: 'title-of', props: { to: refSchema() } }).derive((node, ctx) => {
      const resolved = ctx.resolve?.(node.props.to);
      return resolved ? `${resolved.document.id}:${resolved.target?.type ?? 'document'}` : 'missing';
    });
    const doc = defineDocument(() => (
      <P>
        <Title to={ref('dem/1', 'solution')} /> <Title to={ref('dem/7')} />
      </P>
    ));
    const result = await compile(doc, { resolve: index.resolver() });
    expect([...result.derived.values()]).toEqual(['dem/1:solution', 'missing']);

    const json = await deriveJSON(toJSON(await compile(doc)), { 'title-of': (node, ctx) => (ctx.resolve?.(node.props.to as never) ? 'ok' : 'missing') }, { resolve: index.resolver(), overwrite: true });
    expect(Object.values(json.derived ?? {})).toEqual(['ok', 'missing']);
  });
});

describe('Addressable values', () => {
  it('a path proxy implementing [ADDRESS] is a reference everywhere', async () => {
    const { ADDRESS, toRefTarget, cloneNode } = await import('tsprose');
    const make = (path: string): unknown =>
      new Proxy({}, {
        get: (_, key) => (key === ADDRESS ? () => ({ documentId: path.split('.').slice(0, -1).join('/') || path, ...(path.includes('.') ? { name: path.split('.').at(-1) } : {}) }) : typeof key === 'string' ? make(path ? `${path}.${key}` : key) : undefined),
      });
    const $C = make('') as Record<string, any>;
    const proxy = $C.dem[1].solution;
    expect(cloneNode({ type: 'x', kind: 'inline', props: { to: proxy }, data: undefined, meta: {} } as never as BaseNode).props.to).toBe(proxy);
    expect(toRefTarget($C.dem[1].solution)).toEqual({ $ref: { documentId: 'dem/1', name: 'solution' } });
    const doc = defineDocument(() => <P>See <Link to={$C.dem[1].solution as never}>it</Link>.</P>, { id: 'x' });
    const result = await compile(doc);
    expect(result.diagnostics).toEqual([]);
    expect(result.outgoing[0]!.target).toEqual({ documentId: 'dem/1', name: 'solution' });
    expect(JSON.stringify(toJSON(result))).toContain('{"$ref":{"documentId":"dem/1","name":"solution"}}');
    const index = new CorpusIndex();
    index.update(await compile(p1));
    expect(index.resolve($C.dem[1].solution as never)?.target?.type).toBe('solution');
  });
});
