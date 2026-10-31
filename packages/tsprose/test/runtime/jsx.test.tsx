import { describe, expect, it } from 'vitest';
import { Fragment, isFragmentNode, isTextNode, type BaseNode, type AnyNode } from 'tsprose';
import { B, P, Qed, Sec, Theorem } from '../fixtures/tags.js';

const text = (n: AnyNode) => (isTextNode(n) ? n.text : `<${n.type}>`);

describe('JSX runtime', () => {
  it('tags produce nodes with source positions (jsxDEV)', () => {
    const node = <P center>Hello</P>;
    expect(node.type).toBe('paragraph');
    expect(node.pos).toMatchObject({ line: expect.any(Number), column: expect.any(Number) });
    expect(node.pos!.file).toMatch(/jsx\.test\.tsx$/);
  });

  it('fragments flatten into parents and may be empty', () => {
    const empty = <></>;
    expect(isFragmentNode(empty)).toBe(true);
    expect(empty.children).toBeUndefined();
    expect(empty.diagnostics).toBeUndefined();

    const node = (
      <Sec>
        <>
          <Qed />
          <>
            <Qed />
          </>
        </>
        {false && <Qed />}
      </Sec>
    );
    expect(node.children!.map(text)).toEqual(['<qed>', '<qed>']);
    expect(node.data).toEqual({ count: 2 });
  });

  it('JSX whitespace: newline-separated inline children lose the space (standard JSX), spaces are kept', () => {
    const glued = (
      <P>
        word
        <B>bold</B>
      </P>
    );
    expect(glued.children!.map(text)).toEqual(['word', '<bold>']);
    const spaced = (
      <P>
        word <B>bold</B> tail
      </P>
    );
    expect(spaced.children!.map(text)).toEqual(['word ', '<bold>', ' tail']);
  });

  it('components are plain functions returning nodes, arrays or nothing', () => {
    const Qed2 = () => [<Qed />, <Qed />];
    const Nothing = () => null;
    const Wrap = (props: { children: {} }) => <P>{props.children}</P>;
    const node = (
      <Sec>
        <Qed2 />
        <Nothing />
        <Wrap>text</Wrap>
      </Sec>
    );
    expect(node.children!.map(text)).toEqual(['<qed>', '<qed>', '<paragraph>']);
  });

  it('component exceptions become diagnostics on an empty fragment', () => {
    const Bad = () => {
      throw new Error('boom');
    };
    const node = (<Bad />) as BaseNode;
    expect(isFragmentNode(node)).toBe(true);
    expect(node.diagnostics![0]).toMatchObject({ code: 'tag/component' });
  });

  it('intrinsic (lowercase) tags are reported, not thrown', () => {
    // @ts-expect-error no intrinsic elements in TSProse
    const node = (<div>x</div>) as BaseNode;
    expect(isFragmentNode(node)).toBe(true);
    expect(node.diagnostics![0]).toMatchObject({ code: 'tag/invalid' });
    expect(node.diagnostics![0]!.message).toContain('<div>');
  });

  it('Fragment is exported and stable', () => {
    expect(typeof Fragment).toBe('symbol');
  });

  it('a full element tree', () => {
    const node = (
      <Theorem $="pyth" title="Pythagoras">
        <P>
          In a right triangle <B accent>a² + b² = c²</B>.
        </P>
        <Qed />
      </Theorem>
    );
    expect(node.diagnostics).toBeUndefined();
    expect(node.ref).toBe('pyth');
    expect(node.children!.map(text)).toEqual(['<paragraph>', '<qed>']);
    const p = node.children![0] as BaseNode;
    expect(p.children!.map(text)).toEqual(['In a right triangle ', '<bold>', '.']);
  });
});

describe('hidden position prop (transform positions)', () => {
  it('jsx() reads __tsprosePos into node.pos and strips it from props', async () => {
    const { jsx } = await import('tsprose/jsx-runtime');
    const { P } = await import('../fixtures/tags.js');
    const node = jsx(P, { center: true, children: 'x', __tsprosePos: ['doc.tsx', 12, 5] }) as import('tsprose').BaseNode;
    expect(node.pos).toEqual({ file: 'doc.tsx', line: 12, column: 5 });
    expect(node.props).toEqual({ center: true });
    expect(node.diagnostics ?? []).toEqual([]);
  });

  it('positions reach diagnostics', async () => {
    const { jsx } = await import('tsprose/jsx-runtime');
    const { P } = await import('../fixtures/tags.js');
    const node = jsx(P, { center: 'yes', children: 'x', __tsprosePos: ['doc.tsx', 3, 7] }) as import('tsprose').BaseNode;
    expect(node.diagnostics?.[0]?.pos).toEqual({ file: 'doc.tsx', line: 3, column: 7 });
  });
});
