import { describe, expectTypeOf, it } from 'vitest';
import {
  defineBlock,
  defineInline,
  defineRefs,
  s,
  type AnyTag,
  type BaseNode,
  type BlockNode,
  type InlineNode,
  type Node,
  type NodeOf,
  type Ref,
  type Tag,
  type TextNode,
  type AnyNode,
} from 'tsprose';
import {
  B,
  Em,
  H1,
  Heading,
  Image,
  Item,
  M,
  P,
  Qed,
  Sec,
  Table,
  Td,
  Theorem,
  Tr,
  type ItemDef,
} from '../fixtures/tags.js';

describe('NodeOf inference', () => {
  it('literal name, props, data, ref', () => {
    type T = NodeOf<typeof Theorem>;
    expectTypeOf<T['type']>().toEqualTypeOf<'theorem'>();
    expectTypeOf<T['kind']>().toEqualTypeOf<'block'>();
    expectTypeOf<T['props']>().toEqualTypeOf<{ title: string; level?: number | undefined }>();
    expectTypeOf<T['data']>().toEqualTypeOf<{ slug: string; count: number }>();
    expectTypeOf<T['ref']>().toEqualTypeOf<string>();
    expectTypeOf<T['id']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<T>().toExtend<BaseNode>();
  });

  it('children: tag list → union of node types (structural)', () => {
    type C = NodeOf<typeof Theorem>['children'];
    expectTypeOf<C[number]['type']>().toEqualTypeOf<'paragraph' | 'proof' | 'qed'>();
    expectTypeOf<C[number]>().toExtend<BaseNode>();
  });

  it('children by kind', () => {
    expectTypeOf<NodeOf<typeof P>['children']>().toEqualTypeOf<InlineNode[]>();
    expectTypeOf<NodeOf<typeof Sec>['children']>().toEqualTypeOf<BlockNode[]>();
    expectTypeOf<NodeOf<typeof Qed>['children']>().toEqualTypeOf<undefined>();
    expectTypeOf<NodeOf<typeof Td>['children']>().toEqualTypeOf<AnyNode[]>();
    expectTypeOf<NodeOf<typeof M>['children']>().toEqualTypeOf<InlineNode[]>();
  });

  it('ref modes', () => {
    expectTypeOf<NodeOf<typeof Qed>['ref']>().toEqualTypeOf<undefined>();
    expectTypeOf<NodeOf<typeof P>['ref']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NodeOf<typeof Theorem>['ref']>().toEqualTypeOf<string>();
  });

  it('data defaults to undefined', () => {
    expectTypeOf<NodeOf<typeof Qed>['data']>().toEqualTypeOf<undefined>();
    expectTypeOf<NodeOf<typeof Sec>['data']>().toEqualTypeOf<{ count: number }>();
    expectTypeOf<NodeOf<typeof Item>['data']>().toEqualTypeOf<number>();
  });

  it('recursive and mutually recursive tags via explicit interfaces', () => {
    expectTypeOf<NodeOf<typeof Item>['children'][number]['type']>().toEqualTypeOf<'item' | 'paragraph'>();
    expectTypeOf<NodeOf<typeof Table>['children'][number]['type']>().toEqualTypeOf<'tr'>();
    expectTypeOf<NodeOf<typeof Tr>['children'][number]['type']>().toEqualTypeOf<'td'>();
    expectTypeOf<NodeOf<typeof Em>['children'][number]['type']>().toEqualTypeOf<'em' | 'bold'>();
    expectTypeOf<typeof Item>().toEqualTypeOf<Tag<ItemDef>>();
    expectTypeOf<Node<ItemDef>['children']>().toEqualTypeOf<(Node<ItemDef> | NodeOf<typeof P>)[]>();
  });

  it('presets keep the definition', () => {
    expectTypeOf<NodeOf<typeof H1>>().toEqualTypeOf<NodeOf<typeof Heading>>();
    expectTypeOf<'level' extends keyof Parameters<typeof H1>[0] ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'level' extends keyof Parameters<typeof Heading>[0] ? true : false>().toEqualTypeOf<true>();
  });

  it('tags are assignable to AnyTag and usable in mixed lists', () => {
    expectTypeOf<typeof P>().toExtend<AnyTag>();
    expectTypeOf<typeof Theorem>().toExtend<AnyTag>();
    expectTypeOf<typeof Item>().toExtend<AnyTag>();
    const list = [P, Theorem, Item, B] as const;
    expectTypeOf<(typeof list)[number]>().toExtend<AnyTag>();
  });

  it('no any leaks', () => {
    expectTypeOf<NodeOf<typeof Theorem>['props']>().not.toBeAny();
    expectTypeOf<NodeOf<typeof Theorem>['data']>().not.toBeAny();
    expectTypeOf<NodeOf<typeof Image>['props']>().toEqualTypeOf<{ src: string; width?: number | undefined }>();
  });
});

describe('data callback typing', () => {
  it('props and children are contextually typed', () => {
    defineBlock({
      name: 'x',
      props: { n: s.number(), label: s.optional(s.string()) },
      children: [P, Qed],
      data: ({ props, children }) => {
        expectTypeOf(props).toEqualTypeOf<{ n: number; label?: string | undefined }>();
        expectTypeOf(children[0]!.type).toEqualTypeOf<'paragraph' | 'qed'>();
        return props.n;
      },
    });
    defineInline({
      name: 'y',
      children: 'inline',
      data: ({ children }) => {
        expectTypeOf(children).toEqualTypeOf<InlineNode[]>();
        expectTypeOf(children[0]!).toExtend<BaseNode | TextNode>();
        return 1;
      },
    });
  });

  it('key and derive receive the typed node', () => {
    const T = defineBlock({ name: 'z', props: { src: s.string() }, data: ({ props }) => ({ upper: props.src.toUpperCase() }) })
      .key((node) => {
        expectTypeOf(node.props.src).toEqualTypeOf<string>();
        expectTypeOf(node.data.upper).toEqualTypeOf<string>();
        expectTypeOf(node.type).toEqualTypeOf<'z'>();
        return node.props.src;
      })
      .derive(async (node) => ({ len: node.props.src.length + node.data.upper.length }));
    expectTypeOf<NodeOf<typeof T>['data']>().toEqualTypeOf<{ upper: string }>();
    expectTypeOf<ReturnType<NonNullable<typeof T.def.derive>>>().toEqualTypeOf<{ len: number } | Promise<{ len: number }>>();
  });
});

describe('JSX typing', () => {
  const refs = defineRefs({ thm: Theorem, par: P, h: Heading });

  it('accepts valid usage', () => {
    const ok = (
      <Theorem $={refs.thm} title="T" level={2}>
        <P center>x</P>
        <Qed />
      </Theorem>
    );
    expectTypeOf(ok).toEqualTypeOf<BaseNode>();
    <P $="string-ref">x</P>;
    <H1 $={refs.h}>Title</H1>;
    <Qed />;
    <Image src="a.png" />;
    <Sec>{[<Qed />, <Qed />]}</Sec>;
  });

  it('rejects wrong usage', () => {
    // @ts-expect-error missing required $
    <Theorem title="T"><P>x</P></Theorem>;
    // @ts-expect-error ref handle of another tag
    <Theorem $={refs.par} title="T"><P>x</P></Theorem>;
    // @ts-expect-error $ forbidden on non-referable tags
    <Qed $="x" />;
    // @ts-expect-error children forbidden
    <Qed>x</Qed>;
    // @ts-expect-error children required
    <P />;
    // @ts-expect-error unknown prop
    <P centre>x</P>;
    // @ts-expect-error wrong prop type
    <Image src={1} />;
    // @ts-expect-error missing required prop
    <Image />;
    // @ts-expect-error preset prop cannot be passed again
    <H1 level={2}>x</H1>;
    // @ts-expect-error no intrinsic elements
    <div />;
    const Plain = (_p: {}) => ({ not: 'a node' });
    // @ts-expect-error plain functions returning non-nodes are not valid tags
    <Plain />;
  });

  it('components returning nodes, arrays or null are valid tags', () => {
    const Qed2 = () => [<Qed />, <Qed />];
    const Nothing = () => null;
    const Wrap = (props: { children: {} }) => <P>{props.children}</P>;
    <Sec>
      <Qed2 />
      <Nothing />
      <Wrap>text</Wrap>
    </Sec>;
  });

  it('direct calls are typed like JSX', () => {
    const node = Theorem({ $: refs.thm, title: 'T', children: P({ children: 'x' }) });
    expectTypeOf(node).toEqualTypeOf<NodeOf<typeof Theorem>>();
    expectTypeOf(node.data.slug).toEqualTypeOf<string>();
    // @ts-expect-error title required
    Theorem({ $: refs.thm, children: 'x' });
  });
});

describe('refs typing', () => {
  it('handles carry the definition', () => {
    const refs = defineRefs('file:///x', { thm: Theorem, par: P });
    expectTypeOf(refs.thm).toEqualTypeOf<Ref<typeof Theorem.def>>();
    expectTypeOf(refs.thm.def.name).toEqualTypeOf<'theorem'>();
    // @ts-expect-error non-referable tags are rejected
    defineRefs({ q: Qed });
  });
});
