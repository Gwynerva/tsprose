import { describe, expect, it } from 'vitest';
import { analyzeSource, applyFixes } from '../src/analyze.js';
import { manifest, manifestTransform, manifestWrapping } from './fixtures.js';

const run = (source: string, m = manifest) => analyzeSource(source, 'doc.tsx', { manifest: m });
const codes = (source: string, m = manifest) => run(source, m).findings.map((f) => f.code);

describe('children rule', () => {
  it.each([
    ['block in inline', '<P>text <Qed /></P>', ['children/kind']],
    ['text in block container', '<Proof>loose</Proof>', ['children/kind']],
    ['inline tag in block container', '<Proof><B>x</B></Proof>', ['children/kind']],
    ['children on void tag', '<Qed>x</Qed>', ['children/forbidden']],
    ['foreign type in tag list', '<Theorem $="t" title="T"><P>x</P><Heading level={1}>h</Heading></Theorem>', ['children/pattern', 'children/type']],
    ['pattern violation', '<Theorem $="t" title="T"><Qed /><P>x</P></Theorem>', ['children/pattern']],
    ['pattern ok', '<Theorem $="t" title="T"><P>x</P><Proof><Qed /></Proof><Qed /></Theorem>', []],
    ['arity: required children missing', '<P></P>', ['children/arity']],
    ['arity: max', '<M>a <B>b</B></M>', ['children/arity']],
    ['unknown expression children disable arity/pattern checks', '<Theorem $="t" title="T">{items}</Theorem>', []],
    ['fragments are flattened', '<P><><Qed /></></P>', ['children/kind']],
    ['components are unknown', '<Proof><Custom /></Proof>', []],
    ['known inline components', '<Proof><QedMark /></Proof>', ['children/kind']],
    ['text in block container is fine when the kit wraps', '<Callout>loose <B>x</B></Callout>', []],
  ])('%s', (_name, src, expected) => {
    const m = src.includes('Callout') ? manifestWrapping : manifest;
    expect(codes(`const x = ${src};`, m).filter((c) => c.startsWith('children'))).toEqual(expected);
  });

  it('wrapsLooseInline only applies to kits that wrap', () => {
    expect(codes('const x = <Proof>loose</Proof>;', manifestWrapping)).toContain('children/kind');
  });
});

describe('props rule', () => {
  it.each([
    ['unknown prop', '<P centre>x</P>', ['props/unknown']],
    ['known prop', '<P center>x</P>', []],
    ['common kit prop', '<Callout toc><P>x</P></Callout>', []],
    ['missing required $', '<Theorem title="T"><P>x</P></Theorem>', ['ref/required']],
    ['$ on non-referable', '<Qed $="x" />', ['ref/forbidden']],
    ['preset prop passed again', '<H1 level={2}>x</H1>', ['props/preset']],
    ['spread disables required-ref check', '<Theorem {...rest}><P>x</P></Theorem>', []],
  ])('%s', (_name, src, expected) => {
    expect(codes(`const x = ${src};`).filter((c) => c.startsWith('props') || c.startsWith('ref/'))).toEqual(expected);
  });
});

describe('refs rule', () => {
  it('unused, duplicate and unknown handles in the same file', () => {
    const src = `
      const refs = defineRefs(import.meta.url, { a: P, b: P, c: P });
      const doc = <>
        <P $={refs.a}>a</P>
        <P $={refs.b}>b1</P>
        <P $={refs.b}>b2</P>
        <P $={refs.zzz}>?</P>
      </>;
    `;
    expect(codes(src).filter((c) => c.startsWith('ref/'))).toEqual(['ref/unused', 'ref/duplicate', 'ref/unknown']);
  });

  it('is silent when refs come from another file', () => {
    expect(codes(`const doc = <P $={other.a}>a</P>;`).filter((c) => c.startsWith('ref/'))).toEqual([]);
  });
});

describe('whitespace rule', () => {
  const src = 'const x = (\n  <P>\n    word\n    <B>b</B>\n    tail\n  </P>\n);';

  it('without transform: lost spaces are warnings with a fix', () => {
    const { findings } = run(src);
    const ws = findings.filter((f) => f.rule === 'whitespace');
    expect(ws.map((f) => f.code)).toEqual(['whitespace/lost-space', 'whitespace/lost-space']);
    expect(ws.every((f) => f.severity === 'warning' && f.fix)).toBe(true);
    const fixed = applyFixes(src, ws);
    expect(fixed).toBe("const x = (\n  <P>\n    word\n    {' '}<B>b</B>\n    {' '}tail\n  </P>\n);");
    expect(run(fixed).findings.filter((f) => f.rule === 'whitespace')).toEqual([]);
  });

  it('block siblings are not reported', () => {
    expect(codes('const x = (\n  <Proof>\n    <Qed />\n    <Qed />\n  </Proof>\n);').filter((c) => c.startsWith('whitespace'))).toEqual([]);
  });

  it("with transform: redundant {' '} is reported and removable only when a line break exists", () => {
    const redundant = "const x = (\n  <P>\n    word{' '}\n    <B>b</B>\n  </P>\n);";
    const { findings } = run(redundant, manifestTransform);
    expect(findings.map((f) => f.code)).toEqual(['whitespace/space-hack']);
    expect(applyFixes(redundant, findings)).toBe('const x = (\n  <P>\n    word\n    <B>b</B>\n  </P>\n);');

    const inline = "const x = <P>word{' '}<B>b</B></P>;";
    const r = run(inline, manifestTransform);
    expect(r.findings[0]!.fix).toBeUndefined();
  });
});

describe('positions and parse errors', () => {
  it('reports 1-based line and column', () => {
    const { findings } = run('const x = (\n  <P>text\n    <Qed />\n  </P>\n);');
    expect(findings[0]).toMatchObject({ code: 'children/kind', line: 3, column: 5 });
  });

  it('keeps going on syntax errors', () => {
    const { errors } = run('const x = <P>unclosed;');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('JSON tags description (describeTags) as manifest', () => {
  it('gives the same findings as the live tags', async () => {
    const { describeTags } = await import('tsprose');
    const { manifestFromDescription } = await import('../src/manifest.js');
    const fromJson = manifestFromDescription(JSON.parse(JSON.stringify(describeTags(manifestWrapping.tags))), {
      wrapsLooseInline: manifestWrapping.wrapsLooseInline,
      transform: manifestWrapping.transform,
      inlineComponents: manifestWrapping.inlineComponents,
    });
    const sources = [
      '<P>text <Qed /></P>',
      '<Proof>loose</Proof>',
      '<Qed>x</Qed>',
      '<Theorem $="t" title="T"><Qed /><P>x</P></Theorem>',
      '<Theorem title="T"><P>x</P></Theorem>',
      '<P nope="1">x</P>',
      '<Callout>loose <B>x</B></Callout>',
      '<M>a <B>b</B></M>',
    ];
    for (const src of sources) {
      const source = `const x = ${src};`;
      expect(codes(source, fromJson), src).toEqual(codes(source, manifestWrapping));
    }
  });
});

describe('children counts', () => {
  it('reports order-free occurrence limits', async () => {
    const { defineBlock } = await import('tsprose');
    const Desc = defineBlock({ name: 'desc', children: 'inline' });
    const Hint = defineBlock({ name: 'hint', children: 'inline' });
    const Task = defineBlock({ name: 'task', children: { of: [Desc, Hint], counts: { desc: 1 } } });
    const m = { tags: { Task, Desc, Hint } };
    expect(codes('const x = <Task><Hint>h</Hint><Desc>d</Desc></Task>;', m)).toEqual([]);
    expect(codes('const x = <Task><Hint>h</Hint></Task>;', m)).toEqual(['children/count']);
  });
});

describe('definitions with normalize', () => {
  it('skip static children checks (children are rewritten at runtime); adjacent texts merge', async () => {
    const { defineBlock, defineInline } = await import('tsprose');
    const Main = defineBlock({ name: 'main', children: 'block' });
    const Box = defineBlock({ name: 'box', children: { of: [Main] }, normalize: ({ children }) => Main({ children: [...children] }) });
    const Leaf = defineBlock({ name: 'leaf', normalize: () => [] });
    const M = defineInline({ name: 'math', children: { of: 'inline', pattern: 'text' } });
    const m = { tags: { Box, Main, Leaf, M } };
    expect(codes('const x = <Box>loose <M>x</M></Box>;', m)).toEqual([]);
    expect(codes('const x = <Leaf>x</Leaf>;', m)).toEqual(['children/forbidden']);
    expect(codes('const x = <M>\\sqrt{3}</M>;', m).filter((c) => c.startsWith('children'))).toEqual([]);
  });
});

describe('braces rule', () => {
  it('reports JSX expressions glued to LaTeX commands or ^/_', () => {
    const src = 'const x = <P>Число <M>5 + \\sqrt{20}</M>, <M>x^{2}</M>, <M>{n}</M> и {m`\\sqrt{2}`}</P>;';
    const found = run(src).findings.filter((f) => f.rule === 'braces');
    expect(found.map((f) => f.message.split(' is ')[0])).toEqual(['"{20}" after "\\sqrt"', '"{2}" after "^"']);
  });
});
