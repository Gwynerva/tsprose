import { describe, expect, it } from 'vitest';
import { transform as esbuild } from 'esbuild';
import { transform as prose } from '@tsprose/transform';
import { compile, toJSON } from 'tsprose';
import { Fragment, jsx, jsxs } from 'tsprose/jsx-runtime';
import { format } from '../src/format.js';
import { isInlineContainer, kindOf, tags } from './fixtures.js';

const fmt = (code: string, width = 60) =>
  format(code, 'doc.tsx', { printWidth: width, kindOf, isInlineContainer })
    .code;

describe('paragraph fill', () => {
  it('keeps short paragraphs on one line', () => {
    expect(fmt('const x = <P>Hello <B>world</B>!</P>;')).toBe(
      'const x = <P>Hello <B>world</B>!</P>;',
    );
  });

  it('fills long text to the width with indentation', () => {
    const src =
      'const doc = (\n  <P>one two three four five six seven eight nine ten eleven twelve thirteen fourteen</P>\n);';
    expect(fmt(src, 40)).toBe(
      'const doc = (\n  <P>\n    one two three four five six seven\n    eight nine ten eleven twelve\n    thirteen fourteen\n  </P>\n);',
    );
  });

  it('never breaks inline elements from their words or following punctuation', () => {
    const src =
      'const doc = (\n  <P>aaaa bbbb cccc dddd <M>x^2</M>: eeee ffff gggg (<M>y</M>) hhhh</P>\n);';
    const out = fmt(src, 34);
    expect(out).toBe(
      'const doc = (\n  <P>\n    aaaa bbbb cccc dddd\n    <M>x^2</M>: eeee ffff gggg\n    (<M>y</M>) hhhh\n  </P>\n);',
    );
  });

  it('long inline elements participate in the fill (break inside, not around)', () => {
    const src =
      'const doc = (\n  <P>Start <Dep on={x}>a long linked phrase that goes on and on</Dep>, then more words follow here</P>\n);';
    const out = fmt(src, 40);
    expect(out).toBe(
      'const doc = (\n  <P>\n    Start <Dep on={x}>a long linked\n    phrase that goes on and on</Dep>,\n    then more words follow here\n  </P>\n);',
    );
  });

  it("drops {' '} hacks and joins lines (transform mode)", () => {
    const src =
      "const doc = (\n  <P>\n    word{' '}\n    <B>bold</B>{' '}\n    tail\n  </P>\n);";
    expect(fmt(src)).toBe('const doc = (\n  <P>word <B>bold</B> tail</P>\n);');
  });

  it("emits {' '} at line ends without the transform", () => {
    const src =
      'const doc = (\n  <P>one two three four five six seven <B>eight</B> nine ten</P>\n);';
    const out = format(src, 'doc.tsx', {
      printWidth: 36,
      kindOf,
      transform: false,
    }).code;
    expect(out).toBe(
      "const doc = (\n  <P>\n    one two three four five six{' '}\n    seven <B>eight</B> nine ten\n  </P>\n);",
    );
  });

  it('keeps expressions and comments verbatim, including multi-line ones', () => {
    const src =
      'const doc = (\n  <P>\n    see {math`\n      a = b\n    `} and {/* note */} {value}.\n  </P>\n);';
    expect(fmt(src)).toBe(
      'const doc = (\n  <P>\n    see {math`\n      a = b\n    `} and {/* note */} {value}.\n  </P>\n);',
    );
  });

  it('explicit glue {""} keeps tokens together', () => {
    expect(fmt('const x = <P>a{""}<B>b</B></P>;')).toBe(
      'const x = <P>a<B>b</B></P>;',
    );
  });
});

describe('blocks', () => {
  it('block children one per line, blank lines preserved (max one)', () => {
    const src =
      'const doc = (\n  <Sec title="T">\n\n\n    <P>a</P>\n    <Qed />\n\n    <P>b</P>\n  </Sec>\n);';
    expect(fmt(src)).toBe(
      'const doc = (\n  <Sec title="T">\n    <P>a</P>\n    <Qed />\n\n    <P>b</P>\n  </Sec>\n);',
    );
  });

  it('fragments and nesting', () => {
    const src =
      'const doc = <><Sec><List ordered><Li><P>x</P></Li></List></Sec></>;';
    expect(fmt(src)).toBe(
      'const doc = <>\n  <Sec>\n    <List ordered>\n      <Li>\n        <P>x</P>\n      </Li>\n    </List>\n  </Sec>\n</>;',
    );
  });

  it('loose inline runs inside block containers are filled as paragraphs', () => {
    const src =
      'const doc = (\n  <Li>\n    Some loose text with <B>bold</B>\n    <P>then a block</P>\n    tail text\n  </Li>\n);';
    expect(fmt(src)).toBe(
      'const doc = (\n  <Li>\n    Some loose text with <B>bold</B>\n    <P>then a block</P>\n    tail text\n  </Li>\n);',
    );
  });

  it('blank lines inside loose text are paragraph breaks and stay; inside inline tags they are spaces', () => {
    const src =
      'const doc = (\n  <Li>\n    First <B>bold</B> para\n\n\n    <B>Bold</B> starts the second\n    para that is long enough to be filled\n\n    <P>block\n\n    with blank</P>\n    tail\n  </Li>\n);';
    expect(fmt(src, 40)).toBe(
      'const doc = (\n  <Li>\n    First <B>bold</B> para\n\n    <B>Bold</B> starts the second para\n    that is long enough to be filled\n\n    <P>block with blank</P>\n    tail\n  </Li>\n);',
    );
  });

  it('CRLF sources: single line breaks inside text are not paragraph breaks', () => {
    const src =
      'const doc = (\r\n  <Li>\r\n    one\r\n    two\r\n\r\n    three\r\n  </Li>\r\n);';
    expect(fmt(src)).toBe(
      'const doc = (\r\n  <Li>\r\n    one two\r\n\r\n    three\r\n  </Li>\r\n);',
    );
    expect(fmt(fmt(src))).toBe(fmt(src));
  });

  it('blockCalls: block-producing template calls get their own line', () => {
    const src =
      'const doc = (\n  <Li>\n    Formula: {mm`a^2 + b^2`} and then {mm({ freeze: true })`x`} text, inline {m`y`} stays.\n  </Li>\n);';
    const out = format(src, 'doc.tsx', {
      printWidth: 60,
      kindOf,
      isInlineContainer,
      blockCalls: ['mm'],
    }).code;
    expect(out).toBe(
      'const doc = (\n  <Li>\n    Formula:\n    {mm`a^2 + b^2`}\n    and then\n    {mm({ freeze: true })`x`}\n    text, inline {m`y`} stays.\n  </Li>\n);',
    );
    expect(
      format(out, 'doc.tsx', {
        printWidth: 60,
        kindOf,
        isInlineContainer,
        blockCalls: ['mm'],
      }).code,
    ).toBe(out);
  });

  it('separateBlocks: one blank line between block items at every depth, compact containers excluded', () => {
    const src =
      'const doc = (\n  <>\n    <P>one</P>\n    <Li>\n      text\n      {mm`x`}\n      more text\n      <Qed />\n    </Li>\n    <List>\n      <Li>a</Li>\n      <Li>b</Li>\n    </List>\n  </>\n);';
    const opts = {
      printWidth: 60,
      kindOf,
      isInlineContainer,
      blockCalls: ['mm'],
      separateBlocks: (name: string | undefined) => name !== 'List',
    };
    const out = format(src, 'doc.tsx', opts).code;
    expect(out).toBe(
      'const doc = (\n  <>\n    <P>one</P>\n\n    <Li>\n      text\n\n      {mm`x`}\n\n      more text\n\n      <Qed />\n    </Li>\n\n    <List>\n      <Li>a</Li>\n      <Li>b</Li>\n    </List>\n  </>\n);',
    );
    expect(format(out, 'doc.tsx', opts).code).toBe(out);
  });

  it('options from a JSON tags description (describeTags) match the live tags', async () => {
    const { describeTags, defineBlock: block } = await import('tsprose');
    const { optionsFromDescription } = await import('../src/kinds.js');
    const Mm = block({ name: 'blockMath', children: 'inline' });
    const description = JSON.parse(
      JSON.stringify(describeTags({ ...tags, mm: Mm.template() })),
    );
    const opts = optionsFromDescription(description);
    expect(opts.blockCalls).toEqual(['mm']);
    expect(opts.kindOf('B')).toBe('inline');
    expect(opts.kindOf('Li')).toBe('block');
    expect(opts.isInlineContainer('P')).toBe(true);
    expect(opts.isInlineContainer('Li')).toBe(false);
    const src =
      'const doc = (\n  <Li>\n    Formula: {mm`a`} text <B>bold</B>\n  </Li>\n);';
    expect(format(src, 'doc.tsx', { printWidth: 60, ...opts }).code).toBe(
      'const doc = (\n  <Li>\n    Formula:\n    {mm`a`}\n    text <B>bold</B>\n  </Li>\n);',
    );
  });

  it('formats JSX nested in expressions (call arguments, conditionals)', () => {
    const src =
      "const doc = (\n  <Li>\n    {make('x', <P>\n      Some text and{' '}\n      <B>bold</B>\n    </P>)}\n    {ok && <P>   spaced    text</P>}\n  </Li>\n);";
    const out = format(src, 'doc.tsx', {
      printWidth: 60,
      kindOf,
      isInlineContainer,
    }).code;
    expect(out).toBe(
      "const doc = (\n  <Li>\n    {make('x', <P>Some text and <B>bold</B></P>)}\n    {ok && <P>spaced text</P>}\n  </Li>\n);",
    );
    expect(
      format(out, 'doc.tsx', { printWidth: 60, kindOf, isInlineContainer })
        .code,
    ).toBe(out);
  });

  it('a container with only loose paragraphs uses the block layout', () => {
    const src = 'const doc = <Li>\n  one\n\n  two\n</Li>;';
    expect(fmt(src)).toBe('const doc = <Li>\n  one\n\n  two\n</Li>;');
    expect(fmt(fmt(src))).toBe(fmt(src));
  });

  it('block attributes break one per line when too long; inline attributes never do', () => {
    const src =
      'const doc = (\n  <Image src={someVeryLongIdentifierName} width="800px" invert="dark" />\n);';
    expect(fmt(src, 40)).toBe(
      'const doc = (\n  <Image\n    src={someVeryLongIdentifierName}\n    width="800px"\n    invert="dark"\n  />\n);',
    );
    const inline =
      'const doc = (\n  <P>text <M currentColor>{math`\\displaystyle x^2 + 2x`}</M> more text here and here</P>\n);';
    expect(fmt(inline, 40)).toBe(
      'const doc = (\n  <P>\n    text\n    <M currentColor>{math`\\displaystyle x^2 + 2x`}</M>\n    more text here and here\n  </P>\n);',
    );
  });

  it('empty elements become self-closing', () => {
    expect(fmt('const x = <Sec></Sec>;')).toBe('const x = <Sec />;');
  });

  it('unknown components are treated as blocks; listed inline components as inline', () => {
    expect(fmt('const x = <Sec><Custom a="1" /><P>t <QED /></P></Sec>;')).toBe(
      'const x = <Sec>\n  <Custom a="1" />\n  <P>t <QED /></P>\n</Sec>;',
    );
  });

  it('leaves code outside JSX untouched and handles several regions', () => {
    const src =
      'import {x} from "y";\nconst a   =  1;\nexport const p = <P>a</P>;\nfunction f() { return <P>b   c</P>; }\n';
    expect(fmt(src)).toBe(
      'import {x} from "y";\nconst a   =  1;\nexport const p = <P>a</P>;\nfunction f() { return <P>b c</P>; }\n',
    );
  });

  it('is idempotent', () => {
    const src =
      'const doc = (\n  <Sec title="T">\n    <P>aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn ooo ppp <B>qqq</B>, rrr</P>\n\n    <List><Li>loose <M>x</M>\n    text</Li></List>\n  </Sec>\n);';
    const once = fmt(src, 50);
    expect(fmt(once, 50)).toBe(once);
  });

  it('returns the source on syntax errors', () => {
    const r = format('const x = <P>oops;', 'd.tsx');
    expect(r.changed).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('semantic invariance (transform + runtime)', () => {
  async function evaluate(tsx: string): Promise<unknown> {
    const dialect = prose(tsx, 'doc.tsx', { paragraphs: true }).code;
    const js = await esbuild(dialect, {
      loader: 'tsx',
      jsx: 'automatic',
      jsxImportSource: 'tsprose',
      format: 'esm',
    });
    const body = js.code
      .replace(/import\s*\{[^}]*\}\s*from\s*"tsprose\/jsx-runtime";?/, '')
      .replace(/export\s+/g, '');
    const names = Object.keys(tags);
    const fn = new Function(
      'jsx',
      'jsxs',
      'Fragment',
      'QED',
      'math',
      ...names,
      `${body}; return __out;`,
    );
    const QED = () => jsx(tags.M, { children: '\\blacksquare' });
    const node = fn(
      jsx,
      jsxs,
      Fragment,
      QED,
      String.raw,
      ...names.map((n) => tags[n as keyof typeof tags]),
    );
    const result = await compile(node);
    return toJSON({ root: result.root });
  }

  it.each([
    [
      'filled paragraph with punctuation and inline tags',
      "const __out = (\n  <Sec>\n    <P>Каждый раз при решении уравнения решать мини-головоломку с <Dep on={1}>выделением полного квадрата</Dep> неудобно. Формула <M>x^2</M>: готова (<M>y</M>) и точка.</P>\n    <P>Second <B accent>bold</B>,{' '}\n    tail</P>\n  </Sec>\n);",
    ],
    [
      'loose paragraphs separated by blank lines',
      'const __out = (\n  <Li>\n    First para with <B>bold</B>   and more words to fill the line\n\n    <B>Bold</B> second para\n\n\n    <P>block</P>\n    third   para\n  </Li>\n);',
    ],
    [
      'loose text and blocks',
      'const __out = (\n  <Li>\n    Some   loose text with <B>bold</B>   and <QED />\n    <P>then a block</P>\n    tail text with {math`a=b`} inside\n  </Li>\n);',
    ],
  ])('%s', async (_name, src) => {
    const before = await evaluate(src);
    const formatted = format(src, 'doc.tsx', {
      printWidth: 48,
      kindOf,
      isInlineContainer,
    }).code;
    expect(formatted).not.toBe(src);
    const after = await evaluate(formatted);
    expect(after).toEqual(before);
    // separateBlocks adds blank lines (paragraph separators) next to blocks only: same tree
    const separated = format(src, 'doc.tsx', {
      printWidth: 48,
      kindOf,
      isInlineContainer,
      separateBlocks: true,
    }).code;
    expect(await evaluate(separated)).toEqual(before);
  });
});
