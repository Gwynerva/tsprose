import { describe, expect, it } from 'vitest';
import { transform as esbuildTransform } from 'esbuild';
import { transform } from '../src/transform.js';
import { shouldTransform } from '../src/plugins/unplugin.js';
import { withTSProse, transformSource } from '../src/plugins/jiti.js';

const t = (code: string) => transform(code, 'doc.tsx');

describe('insertion rules', () => {
  it.each([
    ['text ⏎ <Tag>', '<P>\n  word\n  <B>bold</B>\n</P>', '<P>\n  word\n  {" "}<B>bold</B>\n</P>'],
    ['<Tag> ⏎ text', '<P>\n  <B>bold</B>\n  word\n</P>', '<P>\n  <B>bold</B>\n  {" "}word\n</P>'],
    ['<Tag> ⏎ <Tag>', '<P>\n  <B>a</B>\n  <I>b</I>\n</P>', '<P>\n  <B>a</B>\n  {" "}<I>b</I>\n</P>'],
    ['text ⏎ {expr}', '<P>\n  word\n  {x}\n</P>', '<P>\n  word\n  {" "}{x}\n</P>'],
    ['{expr} ⏎ text', '<P>\n  {x}\n  word\n</P>', '<P>\n  {x}\n  {" "}word\n</P>'],
    ['{expr} ⏎ <Tag>', '<P>\n  {x}\n  <B>b</B>\n</P>', '<P>\n  {x}\n  {" "}<B>b</B>\n</P>'],
    ['fragments too', '<>\n  a\n  <B>b</B>\n</>', '<>\n  a\n  {" "}<B>b</B>\n</>'],
    ['same-line space kept, nothing inserted', '<P>word <B>bold</B> tail</P>', '<P>word <B>bold</B> tail</P>'],
    ['leading/trailing edges untouched', '<P>\n  <B>only</B>\n</P>', '<P>\n  <B>only</B>\n</P>'],
    ['closing punctuation after tag', '<P>\n  <M>x</M>\n  : y\n</P>', '<P>\n  <M>x</M>\n  : y\n</P>'],
    ['period on its own line', '<P>\n  sum <M>20%</M>\n  .\n</P>', '<P>\n  sum <M>20%</M>\n  .\n</P>'],
    ['opening punctuation before tag', '<P>\n  see (\n  <M>x</M>)\n</P>', '<P>\n  see (\n  <M>x</M>)\n</P>'],
    ['explicit glue {""}', '<P>\n  word\n  {""}\n  <B>b</B>\n</P>', '<P>\n  word\n  {""}\n  <B>b</B>\n</P>'],
    ["existing {' '} is respected", "<P>\n  word{' '}\n  <B>b</B>\n</P>", "<P>\n  word{' '}\n  <B>b</B>\n</P>"],
    ['comments are transparent', '<P>\n  word\n  {/* note */}\n  <B>b</B>\n</P>', '<P>\n  word\n  {/* note */}\n  {" "}<B>b</B>\n</P>'],
    ['multi-line text alone is already fine', '<P>\n  line one\n  line two\n</P>', '<P>\n  line one\n  line two\n</P>'],
    ['nested JSX inside expressions', '<P>{cond && (\n  <B>\n    a\n    <I>b</I>\n  </B>\n)}</P>', '<P>{cond && (\n  <B>\n    a\n    {" "}<I>b</I>\n  </B>\n)}</P>'],
    ['blocks on separate lines get a (harmless) space', '<Sec>\n  <P>a</P>\n  <P>b</P>\n</Sec>', '<Sec>\n  <P>a</P>\n  {" "}<P>b</P>\n</Sec>'],
    ['template literal expression counts as content', '<P>\n  <M>x</M>\n  {`tail`}\n</P>', '<P>\n  <M>x</M>\n  {" "}{`tail`}\n</P>'],
    ['windows line endings', '<P>\r\n  word\r\n  <B>b</B>\r\n</P>', '<P>\r\n  word\r\n  {" "}<B>b</B>\r\n</P>'],
  ])('%s', (_name, input, expected) => {
    const wrapped = `const x = ${input};`;
    expect(t(wrapped).code).toBe(`const x = ${expected};`);
  });

  it('is idempotent', () => {
    const src = 'const x = <P>\n  word\n  <B>b</B>\n  tail\n  {y}\n</P>;';
    const once = t(src).code;
    const twice = t(once).code;
    expect(twice).toBe(once);
    expect(t(once).insertions).toEqual([]);
  });

  it('reports insertion positions and a source map', () => {
    const r = t('const x = (\n  <P>\n    word\n    <B>b</B>\n  </P>\n);');
    expect(r.insertions).toEqual([{ offset: 31, line: 4, column: 5, between: 'text' }]);
    expect(r.map?.mappings).toBeTruthy();
    expect(r.errors).toEqual([]);
  });

  it('returns the source untouched when nothing changes', () => {
    const src = 'const x = <P>plain</P>;';
    const r = t(src);
    expect(r.code).toBe(src);
    expect(r.map).toBeUndefined();
  });

  it('isBlock skips boundaries between two known blocks only', () => {
    const src = 'const x = <Sec>\n  <P>a</P>\n  <P>b</P>\n  <B>c</B>\n  <B>d</B>\n</Sec>;';
    const r = transform(src, 'a.tsx', { isBlock: (n) => n === 'P' || n === 'Sec' });
    expect(r.insertions.map((i) => i.line)).toEqual([4, 5]);
    expect(r.insertions.map((i) => i.between)).toEqual(['elements', 'elements']);
  });

  it('custom punctuation sets', () => {
    const src = 'const x = <P>\n  <M>x</M>\n  ; y\n</P>;';
    expect(transform(src, 'a.tsx', { closing: '.' }).code).toContain('{" "}; y');
    expect(transform(src, 'a.tsx').code).not.toContain('{" "}');
  });
});

describe('paragraphs option: blank line = paragraph separator', () => {
  const BREAK = '{"\\u2029"}';
  const p = (src: string) => transform(src, 'a.tsx', { paragraphs: true });

  it('is off by default', () => {
    expect(transform('const x = <Sec>\n  a\n\n  b\n</Sec>;', 'a.tsx').code).not.toContain(BREAK);
  });

  it('inserts the separator at blank lines inside text and at blank boundaries, never a space there', () => {
    const src = 'const x = <Sec>\n  one\n  more\n\n  two\n\n  <B>bold</B> three\n  <P>block</P>\n\n  <P>block</P>\n\n  four\n</Sec>;';
    const r = p(src);
    expect(r.code).toBe(
      'const x = <Sec>\n  one\n  more\n\n  ' + BREAK + 'two\n\n  ' + BREAK + '<B>bold</B> three\n  {" "}<P>block</P>\n\n  ' + BREAK + '<P>block</P>\n\n  ' + BREAK + 'four\n</Sec>;',
    );
    expect(r.insertions.map((i) => i.between)).toEqual(['paragraph', 'paragraph', 'text', 'paragraph', 'paragraph']);
  });

  it('a plain line break still becomes a space', () => {
    expect(p('const x = <P>\n  a\n  <B>b</B>\n</P>;').code).toBe('const x = <P>\n  a\n  {" "}<B>b</B>\n</P>;');
  });

  it('CRLF: a single line break is not a blank line', () => {
    const src = 'const x = <Sec>\r\n  one\r\n  <B>two</B>\r\n\r\n  three\r\n</Sec>;';
    const r = p(src);
    expect(r.insertions.map((i) => i.between)).toEqual(['text', 'paragraph']);
  });

  it('is idempotent', () => {
    const src = 'const x = <Sec>\n  a\n\n  <B>b</B>\n\n  c\n</Sec>;';
    const once = p(src).code;
    expect(p(once).code).toBe(once);
    expect(p(once).insertions).toEqual([]);
  });
});

describe('positions option', () => {
  it('adds a hidden position attribute to every element and a file constant once', () => {
    const src = 'const x = (\n  <Sec>\n    <Problem.Hint a="1">t</Problem.Hint>\n    <B />\n  </Sec>\n);';
    const r = transform(src, 'dir/doc.tsx', { positions: true, sourceMap: false });
    expect(r.code).toBe(
      'const __tsproseFile = "dir/doc.tsx";\nconst x = (\n  <Sec __tsprosePos={[__tsproseFile, 2, 3]}>\n    <Problem.Hint __tsprosePos={[__tsproseFile, 3, 5]} a="1">t</Problem.Hint>\n    {" "}<B __tsprosePos={[__tsproseFile, 4, 5]} />\n  </Sec>\n);',
    );
    expect(transform(src, 'a.tsx').code).not.toContain('__tsprose');
  });

  it('is idempotent', () => {
    const once = transform('const x = <P>a</P>;', 'a.tsx', { positions: true }).code;
    expect(transform(once, 'a.tsx', { positions: true }).code).toBe(once);
  });
});

describe('semantics: transformed code evaluates to spaced children', () => {
  /** Transform, transpile with the classic JSX factory and evaluate; returns the root's children as strings. */
  async function evaluate(jsxExpression: string, applyTransform = true): Promise<string[]> {
    const tsx = `const __out = ${jsxExpression};`;
    const code = applyTransform ? transform(tsx, 'doc.tsx').code : tsx;
    const js = await esbuildTransform(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'F', format: 'esm' });
    const h = (type: unknown, _props: unknown, ...children: unknown[]) => ({
      type: typeof type === 'string' ? type : 'F',
      children: children.flat(Number.POSITIVE_INFINITY).map((c) => (typeof c === 'object' && c !== null ? `<${(c as { type: string }).type}>` : String(c))),
    });
    const fn = new Function('h', 'F', 'P', 'B', 'M', `${js.code.replace(/export\s+/g, '')}; return __out;`);
    return (fn(h, 'F', 'P', 'B', 'M') as { children: string[] }).children;
  }

  it.each([
    ['text ⏎ tag', '<P>\n  word\n  <B>b</B>\n</P>', ['word', '<B>'], ['word', ' ', '<B>']],
    ['tag ⏎ text', '<P>\n  <B>b</B>\n  tail\n</P>', ['<B>', 'tail'], ['<B>', ' ', 'tail']],
    ['tag ⏎ tag', '<P>\n  <B>b</B>\n  <M>m</M>\n</P>', ['<B>', '<M>'], ['<B>', ' ', '<M>']],
    ['punctuation stays glued', '<P>\n  <M>x</M>\n  : y\n</P>', ['<M>', ': y'], ['<M>', ': y']],
    ['same line unchanged', '<P>word <B>b</B> tail</P>', ['word ', '<B>', ' tail'], ['word ', '<B>', ' tail']],
  ])('%s', async (_name, src, plainJsx, withRule) => {
    expect(await evaluate(src, false)).toEqual(plainJsx);
    expect(await evaluate(src, true)).toEqual(withRule);
  });
});

describe('plugin helpers', () => {
  it('shouldTransform filters by extension and node_modules', () => {
    expect(shouldTransform('/a/b/doc.tsx', undefined)).toBe(true);
    expect(shouldTransform('/a/b/doc.tsx?v=1', undefined)).toBe(true);
    expect(shouldTransform('/a/node_modules/x/doc.tsx', undefined)).toBe(false);
    expect(shouldTransform('/a/b/code.ts', undefined)).toBe(false);
    expect(shouldTransform('/a/b/code.ts', /\.ts$/)).toBe(true);
    expect(shouldTransform('/a/b/code.ts', (id) => id.endsWith('.ts'))).toBe(true);
  });

  it('withTSProse wraps a jiti transform', () => {
    const seen: string[] = [];
    const next = (opts: { source: string; filename?: string }) => {
      seen.push(opts.source);
      return { code: opts.source };
    };
    const wrapped = withTSProse(next);
    wrapped({ source: 'const x = <P>\n  a\n  <B>b</B>\n</P>;', filename: '/doc.tsx' });
    wrapped({ source: 'const y = 1;', filename: '/code.ts' });
    expect(seen[0]).toContain('{" "}');
    expect(seen[1]).toBe('const y = 1;');
    expect(transformSource('const x = <P>\n  a\n  <B>b</B>\n</P>;', '/doc.tsx')).toContain('{" "}');
  });
});

describe('paragraphs and comments', () => {
  it('a blank line before a comment puts the paragraph break before the comment, once', () => {
    const src = 'const x = <Sec>\n  end of paragraph.\n\n  {/* TODO */}\n  next paragraph\n</Sec>;';
    const r = transform(src, 'a.tsx', { paragraphs: true });
    expect(r.code).toBe('const x = <Sec>\n  end of paragraph.\n\n  {"\\u2029"}{/* TODO */}\n  next paragraph\n</Sec>;');
    expect(transform(r.code, 'a.tsx', { paragraphs: true }).code).toBe(r.code);
  });
});
