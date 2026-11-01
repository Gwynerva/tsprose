import { describe, expectTypeOf, it } from 'vitest';
import {
  createProse,
  type BaseNode,
  type HasRegistry,
  type ProseNode,
  type ProseNodeOf,
  type TextNode,
} from 'tsprose';
import { B, P, Qed, Sec, Theorem, Proof } from '../fixtures/tags.js';

describe('without Registry augmentation', () => {
  it('ProseNode falls back to BaseNode | TextNode (never `never`)', () => {
    expectTypeOf<HasRegistry>().toEqualTypeOf<false>();
    expectTypeOf<ProseNode>().toEqualTypeOf<BaseNode | TextNode>();
  });

  it('createProse gives an explicit typed union', () => {
    const prose = createProse({ tags: [B, P, Qed, Sec, Theorem, Proof] });
    type N = typeof prose.Node;
    expectTypeOf<N['type']>().toEqualTypeOf<
      'text' | 'bold' | 'paragraph' | 'qed' | 'section' | 'theorem' | 'proof'
    >();
    type SecNode = Extract<N, { type: 'section' }>;
    expectTypeOf<SecNode['children'][number]['type']>().toEqualTypeOf<
      'paragraph' | 'qed' | 'section' | 'theorem' | 'proof'
    >();
    type PNode = Extract<N, { type: 'paragraph' }>;
    expectTypeOf<PNode['children'][number]['type']>().toEqualTypeOf<
      'text' | 'bold'
    >();
    expectTypeOf<ProseNodeOf<typeof prose.tags>>().toEqualTypeOf<N>();
  });
});
