import { describe, expect, it, vi } from 'vitest';
import {
  Corpus,
  Include,
  TSProseError,
  compile,
  compileCorpus,
  defineDocument,
  defineHook,
  defineRefs,
  isTextNode,
  select,
  toJSON,
  type BaseNode,
} from 'tsprose';
import { kit } from '../fixtures/kit.js';
import {
  Link,
  article,
  articleRefs,
  broken,
  cycleA,
  cycleB,
  summary,
} from '../fixtures/documents.js';
import { Image, P, Theorem } from '../fixtures/tags.js';

const codes = (ds: readonly { code: string }[]) => ds.map((d) => d.code);

function makeCorpus() {
  return new Corpus().add('article', article).add('summary', summary);
}

describe('compile: ids and hashes', () => {
  it('assigns ref names, keys and hashed ids; deduplicates', async () => {
    const result = await compile(article, { documentId: 'article' });
    expect(result.diagnostics).toEqual([]);
    expect([...result.ids.keys()]).toEqual([
      'intro',
      'pythagoras',
      'why',
      'diagram',
      'right-triangles',
      expect.stringMatching(/^paragraph-[0-9A-Za-z]{10}$/),
      expect.stringMatching(/^paragraph-[0-9A-Za-z]{10}$/),
      expect.stringMatching(/^paragraph-[0-9A-Za-z]{10}$/),
      'triangle-svg',
      expect.stringMatching(/^section-[0-9A-Za-z]{10}$/),
      expect.stringMatching(/^paragraph-[0-9A-Za-z]{10}$/),
      expect.stringMatching(/^paragraph-[0-9A-Za-z]{10}-2$/),
    ]);
    const theorem = result.refs.get('pythagoras')!;
    expect(theorem.id).toBe('pythagoras');
    expect(result.hashes.get(theorem)).toMatch(/^[0-9A-Za-z]{16}$/);
  });

  it('ids are stable across compilations and independent of positions', async () => {
    const a = await compile(article);
    const b = await compile(article);
    expect([...a.ids.keys()]).toEqual([...b.ids.keys()]);
    const docNoPos = defineDocument(() => P({ children: 'Same text twice.' }));
    const r = await compile(docNoPos);
    const [id] = [...r.ids.keys()];
    expect([...a.ids.keys()]).toContain(id);
  });

  it('inserting content before an element does not change hashed ids of unrelated elements', async () => {
    const before = await compile(
      defineDocument(() => [P({ children: 'alpha' }), P({ children: 'beta' })]),
    );
    const after = await compile(
      defineDocument(() => [
        P({ children: 'new' }),
        P({ children: 'alpha' }),
        P({ children: 'beta' }),
      ]),
    );
    const idsBefore = [...before.ids.keys()];
    const idsAfter = [...after.ids.keys()];
    expect(idsAfter.slice(1)).toEqual(idsBefore);
  });
});

describe('compile: refs', () => {
  it('reports unused, foreign and duplicate refs plus invalid props, all at once with positions', async () => {
    const result = await compile(broken, { documentId: 'broken' });
    expect(codes(result.diagnostics).sort()).toEqual(
      [
        'children/pattern',
        'document/loose-inline',
        'props/invalid',
        'ref/duplicate',
        'ref/foreign',
        'ref/unused',
      ].sort(),
    );
    const withPos = result.diagnostics.filter((d) => d.pos);
    expect(withPos.length).toBeGreaterThanOrEqual(3);
    expect(withPos[0]!.pos!.file).toMatch(/documents\.tsx$/);
    const dup = result.diagnostics.find((d) => d.code === 'ref/duplicate')!;
    expect(dup.message).toContain('"twice"');
    const foreign = result.diagnostics.find((d) => d.code === 'ref/foreign')!;
    expect(foreign.path).toEqual(['root', 'paragraph#intro']);
  });

  it('strict mode throws an aggregated error', async () => {
    await expect(compile(broken, { strict: true })).rejects.toBeInstanceOf(
      TSProseError,
    );
    await expect(compile(broken, { strict: true })).rejects.toThrow(
      /ref\/unused/,
    );
  });

  it('string refs become ids and refs entries', async () => {
    const doc = defineDocument(() => P({ $: 'My Intro', children: 'x' }));
    const result = await compile(doc);
    expect(result.refs.get('My Intro')!.id).toBe('my-intro');
  });

  it('loose inline content at root is wrapped when a kit is given', async () => {
    const doc = defineDocument(() => ['hello ', 'world']);
    const result = await compile(doc, { kit: kit.kit });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.children!.map((c) => c.type)).toEqual(['paragraph']);
  });
});

describe('compile: corpus, links and includes', () => {
  it('resolves outgoing links through the corpus', async () => {
    const corpus = makeCorpus();
    const result = await compile(summary, { corpus, documentId: 'summary' });
    expect(result.diagnostics).toEqual([]);
    expect(
      result.outgoing.map((o) => ({ prop: o.prop, target: o.target })),
    ).toEqual([
      { prop: 'to', target: { documentId: 'article', name: 'intro' } },
      { prop: 'of', target: { documentId: 'article', name: 'pythagoras' } },
      // the link inside the transcluded theorem counts as an outgoing reference of the summary too
      { prop: 'to', target: { documentId: 'article', name: 'intro' } },
    ]);
  });

  it('unresolved links are errors with a corpus and warnings without', async () => {
    // fresh refs never bound to any corpus
    const targetRefs = defineRefs({ t: P });
    const user = defineDocument(() => [
      <Link to={targetRefs.t}>x</Link>,
      <Include of={targetRefs.t} />,
    ]);
    const lonely = new Corpus().add('user', user);
    const withCorpus = await compile(user, { corpus: lonely, kit: kit.kit });
    expect(codes(withCorpus.diagnostics)).toEqual([
      'include/unresolved',
      'ref/unresolved',
    ]);
    expect(withCorpus.diagnostics.every((d) => d.severity === 'error')).toBe(
      true,
    );

    const noCorpus = await compile(user, { kit: kit.kit });
    expect(codes(noCorpus.diagnostics)).toEqual([
      'include/unresolved',
      'ref/unresolved',
    ]);
    expect(
      noCorpus.diagnostics.find((d) => d.code === 'ref/unresolved')!.severity,
    ).toBe('warning');
  });

  it('ref handles in props serialize as resolved targets', async () => {
    const corpus = makeCorpus();
    const result = await compile(summary, { corpus, documentId: 'summary' });
    const json = JSON.stringify(toJSON({ root: result.root }));
    expect(json).toContain(
      '"to":{"$ref":{"documentId":"article","name":"intro"}}',
    );
    expect(json).not.toContain('scope');
  });

  it('includes a compiled copy without mutating the source and without ids/refs', async () => {
    const corpus = makeCorpus();
    const result = await compile(summary, {
      corpus,
      documentId: 'summary',
      kit: kit.kit,
    });
    const included = result.root.children![2] as BaseNode;
    expect(included.type).toBe('theorem');
    expect(included.ref).toBeUndefined();
    expect(included.meta.includedFrom).toEqual({
      documentId: 'article',
      name: 'pythagoras',
    });
    expect(included.meta.toc).toBe('Theorem'); // extra meta passed through <Include meta>
    expect(included.id).toMatch(/^pythagorean-theorem$/);
    expect(included.data).toEqual({ slug: 'pythagorean theorem', count: 2 });

    const articleResult = await compile(article, { documentId: 'article' });
    const original = articleResult.refs.get('pythagoras')!;
    expect(original.ref).toBe('pythagoras');
    expect(original.id).toBe('pythagoras');
    const nested = select(included, P);
    expect(nested.every((n) => n.ref === undefined)).toBe(true);
    // ref handles inside the transcluded copy survive cloning and serialize as targets
    const json = JSON.stringify(toJSON({ root: result.root }));
    expect(json).toContain(
      '"to":{"$ref":{"documentId":"article","name":"intro"}}',
    );
    expect(json).not.toContain('"scope"');
  });

  it('compileCorpus compiles everything once and builds back references', async () => {
    const corpus = makeCorpus();
    const { results, index, diagnostics } = await compileCorpus(corpus);
    expect(diagnostics).toEqual([]);
    expect([...results.keys()]).toEqual(['article', 'summary']);
    expect(
      index
        .incoming({ documentId: 'article', name: 'intro' })
        .map((e) => e.source),
    ).toEqual(['link', 'link', 'link']); // article, summary, and the copy included into summary
    expect(
      index
        .incoming({ documentId: 'article', name: 'pythagoras' })
        .map((e) => e.kind),
    ).toEqual(['include']);
  });

  it('include cycles and self includes are diagnostics, not hangs', async () => {
    const corpus = new Corpus().add('a', cycleA).add('b', cycleB);
    const { results } = await compileCorpus(corpus);
    const all = [...results.values()].flatMap((r) => codes(r.diagnostics));
    expect(all).toContain('include/cycle');
  });

  it('corpus binds ref scopes to document ids', () => {
    const corpus = makeCorpus();
    expect(articleRefs.intro.scope.documentId).toBe('article');
    expect(corpus.resolve(articleRefs.intro)).toEqual({
      documentId: 'article',
      name: 'intro',
    });
    expect(corpus.idOfUrl('file:///corpus/article/refs.ts')).toBe('article');
    expect(() => corpus.add('article2', article)).toThrow(/already bound/);
  });
});

describe('compile: hooks, numbering, derive', () => {
  it('hooks see every node in order and return results', async () => {
    const seen: string[] = [];
    const toc = defineHook({
      name: 'toc',
      enter(node) {
        if (!isTextNode(node) && node.type === 'heading')
          seen.push(String(node.id));
      },
      finish: () => seen,
    });
    const result = await compile(article, { hooks: [toc] });
    expect(result.hooks.get('toc')).toEqual(['right-triangles']);
  });

  it('hook errors are diagnostics', async () => {
    const bad = defineHook({
      name: 'bad',
      finish() {
        throw new Error('nope');
      },
    });
    const result = await compile(article, { hooks: [bad] });
    expect(codes(result.diagnostics)).toEqual(['hook/failed']);
  });

  it('numbering assigns meta.number per counter', async () => {
    const result = await compile(article, {
      numbering: { theorem: 'statement', paragraph: 'par' },
    });
    expect(result.counters.get('statement')).toBe(1);
    expect(result.counters.get('par')).toBe(6);
    expect(result.refs.get('pythagoras')!.meta.number).toBe(1);
  });

  it('derive runs per unique key, concurrently, with cache and overrides', async () => {
    const calls: string[] = [];
    const result = await compile(article, {
      concurrency: 2,
      derive: {
        image: async (node) => {
          calls.push(String(node.props.src));
          await new Promise((r) => setTimeout(r, 5));
          return { probed: true };
        },
      },
    });
    const images = select(result.root, Image);
    expect(images).toHaveLength(2);
    // identical props → identical hash → one derive call
    expect(images[0]!.derived).not.toBe(images[1]!.derived);
    expect(calls).toHaveLength(2);
    expect(result.derived.get(images[0]!.derived!)).toEqual({ probed: true });

    const cached = await compile(article, {
      derivedCache: result.derived,
      derive: { image: vi.fn(async () => ({ probed: false })) },
    });
    expect(cached.derived.get(images[0]!.derived!)).toEqual({ probed: true });
  });

  it('derive failures are diagnostics and null values', async () => {
    const result = await compile(article, {
      derive: {
        image: () => {
          throw new Error('io');
        },
      },
    });
    expect(codes(result.diagnostics)).toEqual([
      'derive/failed',
      'derive/failed',
    ]);
    expect([...result.derived.values()]).toEqual([null, null]);
  });

  it("uses the definition's own derive when no override is given", async () => {
    const result = await compile(article);
    const [img] = select(result.root, Image);
    expect(result.derived.get(img!.derived!)).toEqual({ bytes: 1200 });
  });

  it('theorem data is available after compile', async () => {
    const result = await compile(article);
    const [thm] = select(result.root, Theorem);
    expect(thm!.data.slug).toBe('pythagorean theorem');
  });
});
