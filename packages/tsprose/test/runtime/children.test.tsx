import { describe, expect, it } from 'vitest';
import { flattenChildren, normalizeWhitespace, isTextNode, type AnyNode, type BaseNode } from 'tsprose';
import { B, P, Proof, Qed, Sec, Theorem, Td, Tr, Table, M } from '../fixtures/tags.js';

const texts = (nodes: AnyNode[] | undefined) =>
  (nodes ?? []).map((n) => (isTextNode(n) ? n.text : `<${n.type}>`));

describe('flattenChildren', () => {
  it.each([
    ['string', 'hello', ['hello']],
    ['number', 42, ['42']],
    ['zero', 0, ['0']],
    ['bigint', 7n, ['7']],
    ['true dropped', true, []],
    ['false dropped', false, []],
    ['null dropped', null, []],
    ['undefined dropped', undefined, []],
    ['empty string dropped', '', []],
    ['nested arrays', ['a', ['b', ['c']]], ['abc']],
    ['mixed', ['a', null, 1, false, 'b'], ['a1b']],
  ])('%s', (_name, input, expected) => {
    expect(texts(flattenChildren(input))).toEqual(expected);
  });

  it('spreads fragments and merges adjacent text', () => {
    const nodes = flattenChildren(['x', <>y{1}</>, 'z', <B>b</B>, 'w']);
    expect(texts(nodes)).toEqual(['xy1z', '<bold>', 'w']);
  });
});

describe('normalizeWhitespace', () => {
  const t = (s: string): AnyNode => ({ type: 'text', kind: 'inline', text: s });
  const inline = (): AnyNode => (<B>b</B>) as BaseNode;
  const block = (): AnyNode => (<Qed />) as BaseNode;

  it('inline context: collapses runs and trims edges', () => {
    expect(texts(normalizeWhitespace([t('  a \n\t b  '), inline(), t(' c  ')], 'inline'))).toEqual([
      'a b ',
      '<bold>',
      ' c',
    ]);
  });

  it('inline context: keeps a single space between inline nodes', () => {
    expect(texts(normalizeWhitespace([inline(), t(' \n '), inline()], 'inline'))).toEqual(['<bold>', ' ', '<bold>']);
  });

  it('inline context: never touches NBSP', () => {
    expect(texts(normalizeWhitespace([t(' a   ')], 'inline'))).toEqual([' a   ']);
  });

  it('block context: drops whitespace-only text, keeps real text', () => {
    expect(texts(normalizeWhitespace([t('\n  '), block(), t(' x '), block(), t('\n')], 'block'))).toEqual([
      '<qed>',
      ' x ',
      '<qed>',
    ]);
  });

  it('mixed context: drops spaces touching blocks and edges', () => {
    expect(
      texts(normalizeWhitespace([t(' a '), block(), t(' b '), inline(), t(' c '), block(), t(' ')], 'mixed')),
    ).toEqual(['a', '<qed>', 'b ', '<bold>', ' c', '<qed>']);
  });
});

describe('children rules at tag call', () => {
  const diags = (node: BaseNode) => (node.diagnostics ?? []).map((d) => d.code);

  it("children: 'none' rejects children", () => {
    const node = Qed({ children: 'x' } as never);
    expect(diags(node)).toEqual(['children/forbidden']);
    expect(node.children).toBeUndefined();
  });

  it("children: 'inline' rejects blocks and requires at least one child", () => {
    expect(diags(P({ children: <Qed /> }))).toEqual(['children/kind']);
    expect(diags(P({ children: null } as never))).toEqual(['children/arity']);
    expect(diags(P({ children: '   ' }))).toEqual(['children/arity']);
  });

  it("children: 'block' rejects loose inline content without a kit", () => {
    const node = Proof({ children: ['loose text', <Qed />] });
    expect(diags(node)).toEqual(['children/kind']);
  });

  it('tag list rejects foreign types and validates the pattern', () => {
    const ok = Theorem({ $: 'thm', title: 'T', children: [<P>a</P>, <Proof><Qed /></Proof>, <Qed />] });
    expect(ok.diagnostics).toBeUndefined();
    expect(ok.data).toEqual({ slug: 't', count: 3 });

    const wrongType = Theorem({ $: 'thm', title: 'T', children: [<P>a</P>, <Sec><Qed /></Sec>] });
    expect(diags(wrongType)).toEqual(['children/type', 'children/pattern']);

    const wrongOrder = Theorem({ $: 'thm', title: 'T', children: [<Qed />, <P>a</P>] });
    expect(diags(wrongOrder)).toEqual(['children/pattern']);
  });

  it('max arity', () => {
    const node = M({ children: ['a', <B>b</B>] });
    expect(diags(node)).toEqual(['children/arity']);
  });

  it('lazy (recursive) tag lists resolve on first use', () => {
    const table = Table({ children: <Tr><Td>1</Td><Td center>2</Td></Tr> });
    expect(table.diagnostics).toBeUndefined();
    const bad = Table({ children: <Td>x</Td> });
    expect(diags(bad)).toEqual(['children/type']);
  });

  it('any-children containers normalize as mixed content', () => {
    const td = Td({ children: ['  text ', <B>b</B>, ' ', <Qed />, '  '] });
    expect(texts(td.children)).toEqual(['text ', '<bold>', '<qed>']);
  });

  it('inliner cannot contain a block (kind check inside inline tag)', () => {
    const node = B({ children: <Qed /> });
    expect(diags(node)).toEqual(['children/kind']);
  });
});
