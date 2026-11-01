import { describe, expectTypeOf, it } from 'vitest';
import type { NodeOf, ProseNode, TextNode } from 'tsprose';
import { Item, Link, P, Theorem, refs } from '../src/prose.js';

describe('consumer: types from dist', () => {
  it('inferred tag types survive declaration emit', () => {
    expectTypeOf<NodeOf<typeof Theorem>['props']>().toEqualTypeOf<{
      title: string;
    }>();
    expectTypeOf<NodeOf<typeof Theorem>['data']>().toEqualTypeOf<{
      slug: string;
    }>();
    expectTypeOf<
      NodeOf<typeof Theorem>['children'][number]['type']
    >().toEqualTypeOf<'paragraph'>();
    expectTypeOf<NodeOf<typeof Theorem>['meta']['title']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      NodeOf<typeof Item>['children'][number]['type']
    >().toEqualTypeOf<'item' | 'paragraph'>();
    expectTypeOf<Parameters<typeof Theorem>[0]>().toHaveProperty('toc');
  });

  it('registry augmentation from a consumer module works', () => {
    expectTypeOf<Exclude<ProseNode, TextNode>['type']>().toEqualTypeOf<
      'bold' | 'paragraph' | 'theorem' | 'link' | 'item'
    >();
    const f = (n: ProseNode) => {
      if (n.type === 'theorem')
        expectTypeOf(n.children[0]!.type).toEqualTypeOf<'paragraph'>();
      if (n.type === 'paragraph')
        expectTypeOf(n.children[0]!.type).toEqualTypeOf<
          'text' | 'bold' | 'link'
        >();
    };
    void f;
  });

  it('JSX errors are reported against dist types', () => {
    <Theorem $={refs.main} title="T" toc="Custom">
      <P>x</P>
    </Theorem>;
    // @ts-expect-error missing $
    <Theorem title="T">
      <P>x</P>
    </Theorem>;
    // @ts-expect-error unknown prop
    <P bogus>x</P>;
    // @ts-expect-error string is not a ref handle
    <Link to="main">x</Link>;
  });
});
