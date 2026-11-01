/// <reference path="./registry.d.ts" />
import { describe, expectTypeOf, it } from 'vitest';
import type { ProseNode, Registered, TextNode, HasRegistry } from 'tsprose';
import { P, Sec, Theorem } from '../fixtures/tags.js';

type ElementNode = Exclude<ProseNode, TextNode>;

describe('Registry-driven ProseNode', () => {
  it('is a discriminated union over registered tags', () => {
    expectTypeOf<HasRegistry>().toEqualTypeOf<true>();
    expectTypeOf<ProseNode['type']>().toEqualTypeOf<
      | 'text'
      | 'bold'
      | 'italic'
      | 'math'
      | 'paragraph'
      | 'qed'
      | 'image'
      | 'proof'
      | 'theorem'
      | 'heading'
      | 'section'
      | 'item'
      | 'em'
      | 'table'
      | 'tr'
      | 'td'
    >();
  });

  it('narrows in a switch, default reaches never', () => {
    const f = (node: ProseNode) => {
      switch (node.type) {
        case 'theorem':
          expectTypeOf(node.props).toEqualTypeOf<{
            title: string;
            level?: number | undefined;
          }>();
          expectTypeOf(node.children[0]!.type).toEqualTypeOf<
            'paragraph' | 'proof' | 'qed'
          >();
          return;
        case 'paragraph':
          expectTypeOf(node.ref).toEqualTypeOf<string | undefined>();
          expectTypeOf(node.children[0]!.type).toEqualTypeOf<
            'text' | 'bold' | 'italic' | 'math' | 'em'
          >();
          return;
        case 'section':
          // kind-based children resolve to the registered block union
          expectTypeOf(node.children[0]!.type).toEqualTypeOf<
            | 'paragraph'
            | 'qed'
            | 'image'
            | 'proof'
            | 'theorem'
            | 'heading'
            | 'section'
            | 'item'
            | 'table'
            | 'tr'
            | 'td'
          >();
          expectTypeOf(node.data).toEqualTypeOf<{ count: number }>();
          return;
        case 'text':
          expectTypeOf(node.text).toEqualTypeOf<string>();
          return;
        case 'bold':
        case 'italic':
        case 'math':
        case 'qed':
        case 'image':
        case 'proof':
        case 'heading':
        case 'item':
        case 'em':
        case 'table':
        case 'tr':
        case 'td':
          return;
        default:
          expectTypeOf(node).toEqualTypeOf<never>();
      }
    };
    void f;
  });

  it('exhaustive renderer maps are enforced with satisfies', () => {
    type Renderers = {
      [K in ElementNode['type']]: (
        node: Extract<ElementNode, { type: K }>,
      ) => string;
    };
    const full = {
      bold: () => '',
      italic: () => '',
      math: () => '',
      paragraph: (n) => n.children.length.toString(),
      qed: () => '',
      image: (n) => n.props.src,
      proof: () => '',
      theorem: (n) => n.data.slug,
      heading: () => '',
      section: () => '',
      item: () => '',
      em: () => '',
      table: () => '',
      tr: () => '',
      td: () => '',
    } satisfies Renderers;
    void full;
    // @ts-expect-error missing keys
    const partial = { bold: () => '' } satisfies Renderers;
    void partial;
  });

  it('Registered<T> resolves kind children of one tag', () => {
    expectTypeOf<
      Registered<typeof Sec>['children'][number]['type']
    >().toEqualTypeOf<
      | 'paragraph'
      | 'qed'
      | 'image'
      | 'proof'
      | 'theorem'
      | 'heading'
      | 'section'
      | 'item'
      | 'table'
      | 'tr'
      | 'td'
    >();
    expectTypeOf<
      Registered<typeof P>['children'][number]['type']
    >().toEqualTypeOf<'text' | 'bold' | 'italic' | 'math' | 'em'>();
    expectTypeOf<Registered<typeof Theorem>['props']>().toEqualTypeOf<{
      title: string;
      level?: number | undefined;
    }>();
  });
});
