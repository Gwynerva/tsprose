import { describe, expectTypeOf, it } from 'vitest';
import {
  Corpus,
  Include,
  compile,
  compileCorpus,
  defineDocument,
  defineHook,
  defineRefs,
  ref,
  type RefTarget,
  type Addressable,
  select,
  toJSON,
  fromJSON,
  type BaseNode,
  type CompileResult,
  type Diagnostic,
  type Document,
  type NodeOf,
  type ProseJSON,
  type Ref,
} from 'tsprose';
import { P, Theorem, Qed } from '../fixtures/tags.js';

describe('documents and refs', () => {
  const refs = defineRefs('file:///x/refs.ts', { thm: Theorem, par: P });

  it('defineDocument is lazy and typed', () => {
    const doc = defineDocument(() => <P $={refs.par}>x</P>, { refs });
    expectTypeOf(doc).toEqualTypeOf<Document>();
    // content may return arrays, strings, nodes or null
    defineDocument(() => [<Qed />, 'text', null, [<Qed />]]);
    defineDocument(() => null);
    // @ts-expect-error content must be a function
    defineDocument(<Qed />);
  });

  it('Include requires a ref handle', () => {
    <Include of={refs.thm} />;
    // @ts-expect-error string is not a handle
    <Include of="thm" />;
    // @ts-expect-error Include has no children
    <Include of={refs.thm}>x</Include>;
    <Include of={ref('other', 'thm')} />;
    expectTypeOf<NodeOf<typeof Include>['props']['of']>().toEqualTypeOf<
      Ref | RefTarget | Addressable
    >();
  });
});

describe('compile result', () => {
  it('is fully typed', async () => {
    const result = await compile(defineDocument(() => <Qed />));
    expectTypeOf(result).toEqualTypeOf<CompileResult>();
    expectTypeOf(result.root).toEqualTypeOf<BaseNode>();
    expectTypeOf(result.diagnostics).toEqualTypeOf<Diagnostic[]>();
    expectTypeOf(result.refs.get('x')).toEqualTypeOf<BaseNode | undefined>();
    expectTypeOf(result.derived.get('k')).toEqualTypeOf<unknown>();
    expectTypeOf(
      select(result.root, Theorem)[0]!.data.slug,
    ).toEqualTypeOf<string>();
  });

  it('hooks are typed by their result', async () => {
    const hook = defineHook({ name: 'count', finish: () => 42 });
    expectTypeOf(hook.finish!).returns.toEqualTypeOf<
      number | Promise<number>
    >();
    const corpus = new Corpus();
    const out = await compileCorpus(corpus, { hooks: [hook] });
    expectTypeOf(out.results.get('a')).toEqualTypeOf<
      CompileResult | undefined
    >();
  });

  it('json round trip types', async () => {
    const result = await compile(defineDocument(() => <Qed />));
    const json = toJSON({
      root: result.root,
      refs: result.refs,
      derived: result.derived,
    });
    expectTypeOf(json).toEqualTypeOf<ProseJSON>();
    expectTypeOf(fromJSON(json).root).toEqualTypeOf<BaseNode>();
  });
});

describe('defineRefs accepts def carriers', () => {
  it('a component wrapping a referable tag works as a refs template entry', () => {
    const Wrapped = Object.assign(
      (props: { title: string; children?: unknown }) =>
        Theorem({ ...props, $: 'x' } as never),
      { def: Theorem.def },
    );
    const refs = defineRefs({ th: Wrapped });
    expectTypeOf(refs.th).toEqualTypeOf<Ref<typeof Theorem.def>>();
    // @ts-expect-error a component wrapping a non-referable tag is rejected
    defineRefs({ bad: Object.assign(() => Qed({}), { def: Qed.def }) });
  });
});
