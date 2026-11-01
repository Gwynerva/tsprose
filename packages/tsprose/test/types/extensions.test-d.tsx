import { describe, expectTypeOf, it } from 'vitest';
import {
  compile,
  defineBlock,
  defineInline,
  s,
  type AnyNode,
  type CompileResult,
  type NodeOf,
} from 'tsprose';

const Check = defineBlock({
  name: 'check',
  props: s.exclusive(
    s.object({ yes: s.literal(true) }),
    s.object({
      answer: s.union(s.string(), s.number()),
      label: s.optional(s.string()),
    }),
  ),
});

describe('whole-object props', () => {
  it('JSX accepts exactly one member', () => {
    <Check yes />;
    <Check answer={1} label="x" />;
    // @ts-expect-error members cannot be mixed
    <Check yes answer={1} />;
    // @ts-expect-error label belongs to the other member
    <Check yes label="x" />;
    // @ts-expect-error one member is required
    <Check />;
  });

  it('node props are the union', () => {
    expectTypeOf<NodeOf<typeof Check>['props']>().toExtend<
      { yes: true } | { answer: string | number; label?: string | undefined }
    >();
  });
});

describe('normalize and data report', () => {
  it('are typed by the props spec', () => {
    defineBlock({
      name: 'x',
      props: { lines: s.array(s.string()) },
      children: { of: 'block', min: 0 },
      normalize: ({ props, children, report }) => {
        expectTypeOf(props.lines).toEqualTypeOf<string[]>();
        expectTypeOf(children).toEqualTypeOf<readonly AnyNode[]>();
        expectTypeOf(report)
          .parameter(2)
          .toEqualTypeOf<'error' | 'warning' | undefined>();
        return children;
      },
      data: ({ props, report }) => {
        report('x/y', 'message');
        return props.lines.length;
      },
    });
  });
});

describe('counts', () => {
  it('are accepted in the children rule', () => {
    const A = defineBlock({ name: 'a' });
    defineBlock({ name: 'b', children: { of: [A], counts: { a: [0, 2] } } });
    // @ts-expect-error counts take a number or a [min, max] pair
    defineBlock({ name: 'c', children: { of: [A], counts: { a: 'many' } } });
  });
});

describe('templates', () => {
  const M = defineInline({
    name: 'math',
    children: 'inline',
    props: { color: s.optional(s.boolean()) },
  });
  const m = M.template();
  it('return the tag node and accept the tag props without children', () => {
    expectTypeOf(m`x`).toEqualTypeOf<NodeOf<typeof M>>();
    expectTypeOf(m({ color: true })`x`).toEqualTypeOf<NodeOf<typeof M>>();
    expectTypeOf(m.def).toEqualTypeOf<typeof M.def>();
    // @ts-expect-error unknown prop
    m({ colour: true });
  });
});

describe('compile accepts a list of nodes', () => {
  it('types', () => {
    expectTypeOf(compile([] as AnyNode[])).toEqualTypeOf<
      Promise<CompileResult>
    >();
  });
});
