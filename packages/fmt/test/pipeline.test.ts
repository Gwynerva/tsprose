import { describe, expect, it } from 'vitest';
import { transform as esbuild } from 'esbuild';
import { transform as prose } from '@tsprose/transform';
import { compile, toJSON } from 'tsprose';
import { Fragment, jsx, jsxs } from 'tsprose/jsx-runtime';
import { formatAsync } from '../src/pipeline.js';
import { format } from '../src/format.js';
import { isInlineContainer, kindOf, tags } from './fixtures.js';

const base = { printWidth: 120, kindOf, isInlineContainer, blockCalls: ['mm'] };

/** Transform with the TSProse rules, evaluate with the tsprose runtime, compile: the meaning of a prose file. */
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
    'helper',
    ...names,
    `${body}; return __out;`,
  );
  const helper = (label: string, node: unknown) => [label, node];
  const node = fn(
    jsx,
    jsxs,
    Fragment,
    helper,
    ...names.map((n) => tags[n as keyof typeof tags]),
  );
  return toJSON({ root: (await compile(node)).root });
}

const messy = [
  "import {x} from './x'",
  'const opts={a:1,b:[1,2,3]}',
  'const __out = (',
  '  <Li>',
  '    First paragraph with <B>bold</B>',
  '    and a line break that is a space',
  '',
  '    <B>Bold</B> starts the second; glued <B>a</B>,',
  '    punctuation.',
  "    {helper('x',   <P>Nested   <B>prose</B>   in a call</P>)}",
  '    <P $="intro" center>Ref   first</P>',
  '  </Li>',
  ');',
].join('\n');

describe('formatAsync with preFormat (transform → code formatter → prose pass)', () => {
  it('oxfmt formats the code, the prose pass the prose; meaning is unchanged; idempotent', async () => {
    const out = (
      await formatAsync(messy, 'doc.tsx', {
        ...base,
        preFormat: { oxfmt: { singleQuote: true } },
      })
    ).code;
    expect(out).toContain("import { x } from './x';");
    expect(out).toContain('const opts = { a: 1, b: [1, 2, 3] };');
    // prose: no `{" "}`, no unicode markers left, paragraphs kept
    expect(out).not.toMatch(/\{" "\}|\{' '\}|\\u2029/);
    expect(out).toContain(
      'First paragraph with <B>bold</B> and a line break that is a space',
    );
    expect(out).toMatch(
      /space\n\n\s+<B>Bold<\/B> starts the second; glued <B>a<\/B>, punctuation\./,
    );
    // the call itself is laid out by the code formatter; the nested prose by the prose pass
    expect(out).toContain('<P>Nested <B>prose</B> in a call</P>');
    expect(await evaluate(out)).toEqual(await evaluate(messy));
    expect(
      (
        await formatAsync(out, 'doc.tsx', {
          ...base,
          preFormat: { oxfmt: { singleQuote: true } },
        })
      ).code,
    ).toBe(out);
  });

  it('a naive code formatter pass alone would change the meaning (why the transform runs first)', async () => {
    const { format: oxfmt } = await import('oxfmt');
    const naive = (await oxfmt('doc.tsx', messy, { printWidth: 60 })).code;
    expect(await evaluate(naive)).not.toEqual(await evaluate(messy));
  });

  it('reads the code formatter output as standard JSX (a break next to a tag is not a space there)', async () => {
    // oxfmt may break between </M> and '".' — legal in standard JSX, a space under the TSProse rule if read naively.
    const src =
      'const __out = (\n  <Li>\n    Long text so that the formatter wants to wrap this exact line right here at "<B>1 + 1 + 1</B>". And then more words follow.\n  </Li>\n);';
    const out = (
      await formatAsync(src, 'doc.tsx', {
        ...base,
        printWidth: 80,
        preFormat: 'oxfmt',
      })
    ).code;
    expect(out).toContain('"<B>1 + 1 + 1</B>".');
    expect(await evaluate(out)).toEqual(await evaluate(src));
    expect(
      (
        await formatAsync(out, 'doc.tsx', {
          ...base,
          printWidth: 80,
          preFormat: 'oxfmt',
        })
      ).code,
    ).toBe(out);
  });

  it('custom function formatters receive standard-JSX source', async () => {
    let seen = '';
    const out = await formatAsync(messy, 'doc.tsx', {
      ...base,
      preFormat: (code) => {
        seen = code;
        return code.replace(
          'const opts={a:1,b:[1,2,3]}',
          'const opts = { a: 1, b: [1, 2, 3] };',
        );
      },
    });
    expect(seen).toContain('{"\\u2029"}');
    expect(out.code).toContain('const opts = { a: 1, b: [1, 2, 3] };');
    expect(await evaluate(out.code)).toEqual(await evaluate(messy));
  });

  it('a failing code formatter leaves the source untouched and reports', async () => {
    const out = await formatAsync(messy, 'doc.tsx', {
      ...base,
      preFormat: () => {
        throw new Error('boom');
      },
    });
    expect(out.code).toBe(messy);
    expect(out.errors).toEqual(['preFormat failed: boom']);
  });

  it('without preFormat it is exactly format()', async () => {
    expect((await formatAsync(messy, 'doc.tsx', base)).code).toBe(
      format(messy, 'doc.tsx', base).code,
    );
  });

  it('keeps CRLF line endings', async () => {
    const crlf = messy.replace(/\n/g, '\r\n');
    const out = (
      await formatAsync(crlf, 'doc.tsx', { ...base, preFormat: 'oxfmt' })
    ).code;
    expect(out.includes('\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
});

describe('refFirst', () => {
  it('prints $ first unless the element has spread attributes', () => {
    const src =
      'const __out = <Li><P center $="a">x</P><P {...p} center $="b">y</P></Li>;';
    const out = format(src, 'doc.tsx', { ...base, refFirst: true }).code;
    expect(out).toContain('<P $="a" center>x</P>');
    expect(out).toContain('<P {...p} center $="b">y</P>');
  });
});

describe('line endings through the pipeline', () => {
  it('CRLF files with multi-line templates: no doubled CR, idempotent', async () => {
    const src =
      'const __out = (\r\n  <Li>\r\n    Text\r\n    {mm`\r\n      a = b \\\\\r\n      c = d\r\n    `}\r\n  </Li>\r\n);\r\n';
    const once = (
      await formatAsync(src, 'doc.tsx', { ...base, preFormat: 'oxfmt' })
    ).code;
    expect(once.includes('\r\r')).toBe(false);
    expect(once.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(
      (await formatAsync(once, 'doc.tsx', { ...base, preFormat: 'oxfmt' }))
        .code,
    ).toBe(once);
  });
});

describe('prose templates keep the author layout', () => {
  it('a long math template is not laid out like a function call', async () => {
    const tex = String.raw`x^2 + 2 \cdot x \cdot \frac{B}{2A} + \left( \frac{B}{2A} \right)^2 = -\frac{C}{A} + \left( \frac{B}{2A} \right)^2`;
    const src = `const __out = (\n  <Li>\n    Formula {m({ currentColor: true })\`${tex}\`} here.\n  </Li>\n);\n`;
    const out = (
      await formatAsync(src, 'doc.tsx', { ...base, preFormat: 'oxfmt' })
    ).code;
    expect(out).toContain(`{m({ currentColor: true })\`${tex}\`}`);
    expect(
      (await formatAsync(out, 'doc.tsx', { ...base, preFormat: 'oxfmt' })).code,
    ).toBe(out);
  });
});
