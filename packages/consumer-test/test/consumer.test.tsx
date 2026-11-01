import { describe, expect, it } from 'vitest';
import {
  Corpus,
  compile,
  select,
  toJSON,
  fromJSON,
  createProse,
} from 'tsprose';
import { article, B, Item, Link, P, Theorem } from '../src/prose.js';

describe('consumer: built package', () => {
  it('compiles a document end to end', async () => {
    const corpus = new Corpus().add('article', article);
    const result = await compile(article, {
      corpus,
      documentId: 'article',
      kit: Theorem.kit,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.children!.map((c) => c.type)).toEqual([
      'theorem',
      'item',
      'paragraph',
    ]);
    const [thm] = select(result.root, Theorem);
    expect(thm!.id).toBe('main');
    expect(thm!.meta).toEqual({ toc: true, title: 'Main' });
    expect(result.outgoing[0]!.target).toEqual({
      documentId: 'article',
      name: 'main',
    });
    const json = toJSON({
      root: result.root,
      documentId: 'article',
      refs: result.refs,
    });
    const back = fromJSON(json, {
      prose: createProse({ tags: [B, P, Theorem, Link, Item] }),
    });
    expect(back.diagnostics).toEqual([]);
    expect(JSON.stringify(json)).toContain(
      '"$ref":{"documentId":"article","name":"main"}',
    );
  });

  it('source positions come from jsxDEV in tests', () => {
    const node = <P>x</P>;
    expect(node.pos?.file).toMatch(/consumer\.test\.tsx$/);
  });
});
