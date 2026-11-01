import { describe, expect, it } from 'vitest';
import {
  compile,
  indexTree,
  createProse,
  find,
  findAll,
  fromJSON,
  isTextNode,
  select,
  slugify,
  toJSON,
  walk,
  walkAsync,
  type AnyNode,
} from 'tsprose';
import { Link, article } from '../fixtures/documents.js';
import { allTags, B, P, Qed, Sec, Theorem } from '../fixtures/tags.js';

const label = (n: AnyNode) => (isTextNode(n) ? 'text' : n.type);

const tree = (
  <Sec>
    <P>
      Hello <B>world</B>!
    </P>
    <Qed />
    <P>Second.</P>
  </Sec>
);

describe('walk', () => {
  it('visits in document order with enter/leave, paths and parents', () => {
    const enters: string[] = [];
    const leaves: string[] = [];
    walk(tree, {
      enter: (n, ctx) => {
        enters.push(`${ctx.path.join('/')}@${ctx.depth}`);
      },
      leave: (n) => {
        leaves.push(label(n));
      },
    });
    expect(enters).toEqual([
      'section@0',
      'section/paragraph[0]@1',
      'section/paragraph[0]/text[0]@2',
      'section/paragraph[0]/bold[1]@2',
      'section/paragraph[0]/bold[1]/text[0]@3',
      'section/paragraph[0]/text[2]@2',
      'section/qed[1]@1',
      'section/paragraph[2]@1',
      'section/paragraph[2]/text[0]@2',
    ]);
    expect(leaves).toEqual([
      'text',
      'text',
      'bold',
      'text',
      'paragraph',
      'qed',
      'text',
      'paragraph',
      'section',
    ]);
  });

  it('skip and stop', () => {
    const seen: string[] = [];
    walk(tree, (n) => {
      seen.push(label(n));
      if (n.type === 'paragraph') return 'skip';
    });
    expect(seen).toEqual(['section', 'paragraph', 'qed', 'paragraph']);
    const stopped: string[] = [];
    walk(tree, (n) => {
      stopped.push(label(n));
      if (n.type === 'bold') return 'stop';
    });
    expect(stopped).toEqual(['section', 'paragraph', 'text', 'bold']);
  });

  it('walkAsync mirrors walk', async () => {
    const seen: string[] = [];
    await walkAsync(tree, {
      async enter(n) {
        seen.push(label(n));
        if (n.type === 'paragraph') return 'skip';
      },
    });
    expect(seen).toEqual(['section', 'paragraph', 'qed', 'paragraph']);
  });

  it('find, findAll, select, indexTree', async () => {
    expect(label(find(tree, (n) => n.type === 'bold')!)).toBe('bold');
    expect(findAll(tree, (n) => n.type === 'paragraph')).toHaveLength(2);
    const paragraphs = select(tree, P);
    expect(paragraphs[0]!.data.center).toBe(false);

    const result = await compile(article);
    const index = indexTree(result.root);
    const thm = index.byId.get('pythagoras')!;
    expect(thm.type).toBe('theorem');
    expect(index.byType.get('paragraph')).toHaveLength(6);
    const proof = thm.children![1]!;
    expect(index.parentOf(proof)).toBe(thm);
    expect(index.ancestorsOf(proof).map((a) => a.type)).toEqual([
      'root',
      'theorem',
    ]);
  });
});

describe('JSON', () => {
  it('round-trips a compiled document (idempotent, compact)', async () => {
    const result = await compile(article, { documentId: 'article' });
    const json = toJSON({
      root: result.root,
      documentId: 'article',
      refs: result.refs,
      derived: result.derived,
    });
    expect(json.v).toBe(2);
    expect(json.refs).toEqual({
      intro: 'intro',
      pythagoras: 'pythagoras',
      _why: 'why',
      diagram: 'diagram',
    });
    const text = JSON.stringify(json);
    expect(text).not.toContain('"pos"');
    expect(text).not.toContain('diagnostics');
    expect(text).not.toContain('"props":{}');

    const back = fromJSON(json, {
      prose: createProse({ tags: [...allTags, Link] }),
    });
    expect(back.diagnostics).toEqual([]);
    expect(back.documentId).toBe('article');
    expect(
      toJSON({
        root: back.root,
        documentId: 'article',
        refs: result.refs,
        derived: back.derived,
      }),
    ).toEqual(json);
  });

  it('text children are plain strings and kinds are preserved', async () => {
    const result = await compile(tree);
    const json = toJSON({ root: result.root });
    const sec = (json.root as { c: unknown[] }).c![0] as {
      t: string;
      k: string;
      c: unknown[];
    };
    expect(sec.t).toBe('section');
    expect(sec.k).toBe('block');
    const p = sec.c[0] as { c: unknown[] };
    expect(p.c[0]).toBe('Hello ');
    expect((p.c[1] as { t: string; k: string }).k).toBe('inline');
  });

  it('unknown types and invalid props are reported when a prose instance is given', () => {
    const prose = createProse({ tags: [P, Theorem] });
    const back = fromJSON(
      {
        v: 2,
        root: {
          t: 'root',
          k: 'block',
          c: [
            { t: 'nope', k: 'block' },
            { t: 'theorem', k: 'block', p: { title: 1 } },
          ],
        },
      },
      { prose },
    );
    expect(back.diagnostics.map((d) => d.code)).toEqual([
      'json/unknown-type',
      'props/invalid',
    ]);
    expect(() => fromJSON({ v: 1 as 2, root: 'x' })).toThrow('version');
  });
});

describe('slugify', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Trim -- me  ', 'trim-me'],
    ['Crème brûlée', 'creme-brulee'],
    ['_squareRootExample', 'square-root-example'],
    ['Теорема Пифагора!', 'теорема-пифагора'],
    ['a/b.c', 'a-b-c'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
