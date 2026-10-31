// normalize, data report, counts, whole-object props schemas, text templates, nodes in data, compile(array), $ from JSON.
import { describe, expect, it } from 'vitest';
import {
  compile,
  createTagKit,
  defineBlock,
  defineInline,
  defineRefs,
  fromJSON,
  isTextNode,
  isTextTemplate,
  nodesInData,
  s,
  toJSON,
  type AnyNode,
  type BaseNode,
} from 'tsprose';

const codes = (node: BaseNode) => (node.diagnostics ?? []).map((d) => d.code);
const shape = (node: AnyNode): unknown => (isTextNode(node) ? node.text : { [node.type]: (node.children ?? []).map(shape) });

const P = defineBlock({ name: 'paragraph', children: 'inline', ref: 'optional' });
const kit = createTagKit({ wrapLooseInline: P });
const Main = kit.defineBlock({ name: 'main', children: 'block' });
const Proof = kit.defineBlock({ name: 'proof', children: 'block' });
const B = defineInline({ name: 'bold', children: 'inline' });

describe('normalize', () => {
  const Statement = kit.defineBlock({
    name: 'statement',
    props: { title: s.string() },
    children: { of: [Main, Proof], pattern: 'main proof?' },
    ref: 'optional',
    // Loose content (anything but parts) goes into <Main>.
    normalize: ({ children }) => (children.some((c) => c.type === 'main') ? children : Main({ children: [...children] })),
  });

  it('rewrites children before validation (wrap loose content into a part)', () => {
    const node = Statement({ title: 'T', children: ['Loose text ', <P>and a paragraph</P>] });
    expect(codes(node)).toEqual([]);
    expect(node.children!.map(shape)).toEqual([{ main: [{ paragraph: ['Loose text'] }, { paragraph: ['and a paragraph'] }] }]);
  });

  it('keeps explicit parts and still validates the result', () => {
    const ok = Statement({ title: 'T', children: [<Main>m</Main>, <Proof>p</Proof>] });
    expect(codes(ok)).toEqual([]);
    const bad = Statement({ title: 'T', children: [<Proof>p</Proof>, <Main>m</Main>] });
    expect(codes(bad)).toEqual(['children/pattern']);
  });

  it('can take generated content from a prop and report problems', () => {
    const Generated = kit.defineBlock({
      name: 'generated',
      props: { lines: s.optional(s.array(s.string())) },
      children: { of: 'block', min: 0 },
      normalize: ({ props, children, report }) => {
        if (props.lines && children.length) report('generated/both', 'Pass either lines or children', 'warning');
        return props.lines ? props.lines.map((line) => P({ children: line })) : children;
      },
    });
    const node = Generated({ lines: ['a', 'b'], children: <P>ignored</P> });
    expect(node.children!.map(shape)).toEqual([{ paragraph: ['a'] }, { paragraph: ['b'] }]);
    expect(node.diagnostics?.map((d) => [d.code, d.severity])).toEqual([['generated/both', 'warning']]);
  });

  it('a throwing normalize becomes a diagnostic', () => {
    const Broken = defineBlock({ name: 'broken', children: { of: 'block', min: 0 }, normalize: () => { throw new Error('boom'); } });
    expect(codes(Broken({}))).toEqual(['tag/normalize']);
  });
});

describe('data report', () => {
  it('reports problems from data() without throwing; data still computed', () => {
    const Problem = defineBlock({
      name: 'problem',
      props: { title: s.string() },
      children: 'block',
      data: ({ props, children, report }) => {
        if (children.length > 2) report('problem/long', 'Problem has many parts', 'warning');
        if (!props.title.trim()) report('problem/title', 'Title is empty');
        return { title: props.title.trim() };
      },
    });
    const node = Problem({ title: ' ', children: [<P>a</P>, <P>b</P>, <P>c</P>] });
    expect(node.data).toEqual({ title: '' });
    expect(node.diagnostics?.map((d) => [d.code, d.severity])).toEqual([
      ['problem/long', 'warning'],
      ['problem/title', 'error'],
    ]);
  });
});

describe('children counts', () => {
  const Description = defineBlock({ name: 'description', children: 'inline' });
  const Hint = defineBlock({ name: 'hint', children: 'inline' });
  const Answer = defineBlock({ name: 'answer', children: 'inline' });
  const Task = defineBlock({
    name: 'task',
    children: { of: [Description, Hint, Answer], counts: { description: 1, answer: [0, 1] } },
  });

  it('order-free occurrence limits', () => {
    expect(codes(Task({ children: [<Hint>h</Hint>, <Description>d</Description>, <Hint>h</Hint>, <Answer>a</Answer>] }))).toEqual([]);
    expect(codes(Task({ children: [<Hint>h</Hint>, <Description>d</Description>] }))).toEqual([]);
  });

  it('reports missing and repeated types with readable messages', () => {
    const node = Task({ children: [<Answer>a</Answer>, <Answer>b</Answer>] });
    expect(node.diagnostics?.map((d) => d.message)).toEqual([
      '<task> requires exactly 1 <description>, received 0',
      '<task> requires at most 1 <answer>, received 2',
    ]);
  });

  it('rejects counts for types outside the children list', () => {
    const Wrong = defineBlock({ name: 'wrong', children: { of: [Hint], counts: { answer: 1 } } });
    expect(() => Wrong({ children: <Hint>h</Hint> })).toThrow(/counts mention "answer"/);
  });
});

describe('whole-object props schema (s.exclusive)', () => {
  const Check = defineBlock({
    name: 'check',
    props: s.exclusive(
      s.object({ yes: s.literal(true), label: s.optional(s.string()) }),
      s.object({ answer: s.union(s.string(), s.number()), label: s.optional(s.string()) }),
      s.object({ answers: s.array(s.number()), label: s.optional(s.string()) }),
    ),
    data: ({ props }) => ('yes' in props && props.yes ? { kind: 'yes' as const } : { kind: 'value' as const }),
  });

  it('accepts exactly one member', () => {
    const a = Check({ yes: true, label: 'L' });
    expect(codes(a)).toEqual([]);
    expect(a.props).toEqual({ yes: true, label: 'L' });
    expect(codes(Check({ answer: 4 }))).toEqual([]);
  });

  it('rejects mixed members and unknown keys at runtime', () => {
    // @ts-expect-error mutually exclusive props
    const mixed = Check({ yes: true, answer: 4 });
    expect(codes(mixed)).toEqual(['props/invalid']);
    expect(mixed.diagnostics![0]!.message).toMatch(/cannot be combined/);
    // @ts-expect-error unknown prop
    expect(codes(Check({ answer: 1, nope: 1 }))).toEqual(['props/invalid']);
  });

  it('undefined values count as "not given"', () => {
    expect(codes(Check({ answer: 3, label: undefined }))).toEqual([]);
  });

  it('round-trips through JSON with prop validation', async () => {
    const result = await compile(<>{Check({ answer: 'x' })}</>);
    const back = fromJSON(toJSON(result), { prose: { byName: new Map([['check', Check]]) } as never });
    expect(back.diagnostics).toEqual([]);
  });
});

describe('text templates', () => {
  const M = defineInline({
    name: 'math',
    children: { of: 'inline', pattern: 'text' },
    props: { color: s.optional(s.boolean()) },
    data: ({ children }) => ({ tex: children.map((c) => (isTextNode(c) ? c.text : '')).join('') }),
  });
  const m = M.template();

  it('builds the same node as the tag, keeping backslashes and braces verbatim', () => {
    const node = m`\frac{a}{b} + x^{${2}}`;
    expect(node.type).toBe('math');
    expect(node.data).toEqual({ tex: '\\frac{a}{b} + x^{2}' });
    expect(m({ color: true })`y`.props).toEqual({ color: true });
  });

  it('carries the definition for tooling', () => {
    expect(isTextTemplate(m)).toBe(true);
    expect(m.def).toBe(M.def);
    expect(isTextTemplate(M)).toBe(false);
  });
});

describe('nodes in data', () => {
  const Inline = defineInline({ name: 'formula', children: 'inline' }).derive(async (node) => `derived:${(node.children![0] as { text: string }).text}`);
  const Select = defineBlock({
    name: 'select',
    props: { options: s.array(s.string()) },
    data: ({ props }) => ({ options: props.options.map((text) => ({ content: [P({ children: [Inline({ children: text })] })] })) }),
  });

  it('nodesInData finds nodes at any depth', () => {
    const node = Select({ options: ['a', 'b'] });
    expect(nodesInData(node.data).map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('compile derives nodes stored in data; JSON keeps them as nodes', async () => {
    const result = await compile([Select({ options: ['a', 'b'] })]);
    expect([...result.derived.values()].sort()).toEqual(['derived:a', 'derived:b']);
    const json = toJSON(result);
    const back = fromJSON(json);
    const option = (back.root.children![0] as BaseNode).data as { options: { content: BaseNode[] }[] };
    expect(option.options[1]!.content[0]!.type).toBe('paragraph');
    const inner = option.options[1]!.content[0]!.children![0] as BaseNode;
    expect(back.derived.get(inner.derived!)).toBe('derived:b');
    expect(JSON.stringify(json)).toContain('"$node"');
  });
});

describe('compile(array) and $ from JSON', () => {
  it('compiles a list of nodes as a fragment', async () => {
    const result = await compile([P({ children: 'one' }), P({ children: 'two' })]);
    expect(result.root.children!.map(shape)).toEqual([{ paragraph: ['one'] }, { paragraph: ['two'] }]);
  });

  it('$ accepts a serialized handle', () => {
    const refs = defineRefs({ intro: P });
    const serialized = JSON.parse(JSON.stringify({ $ref: { documentId: 'doc', name: refs.intro.name } }));
    const node = P({ $: serialized, children: 'x' });
    expect(node.ref).toBe('intro');
    expect(codes(node)).toEqual([]);
  });
});

describe('describeTags (JSON manifest for tools)', () => {
  it('describes tags, member tags and templates as plain JSON', async () => {
    const { describeTags } = await import('tsprose');
    const Hint = kit.defineBlock({ name: 'hint', children: 'block' });
    const Desc = kit.defineBlock({ name: 'desc', children: 'block' });
    const Task = Object.assign(
      kit.defineBlock({ name: 'task', ref: 'optional', children: { of: [Desc, Hint], counts: { desc: 1 } } }),
      { Hint, Description: Desc },
    );
    const M = defineInline({ name: 'math', children: 'inline' });
    const H = defineBlock({ name: 'heading', props: { level: s.number() }, children: 'inline' });
    const description = describeTags({ Task, P, m: M.template(), H1: H.with({ level: 1 }) });
    expect(JSON.parse(JSON.stringify(description))).toEqual(description);
    expect(Object.keys(description.tags).sort()).toEqual(['H1', 'P', 'Task', 'Task.Description', 'Task.Hint', 'm']);
    expect(description.tags['Task']).toMatchObject({
      type: 'task',
      kind: 'block',
      ref: 'optional',
      usage: 'tag',
      children: { mode: 'tags', types: ['desc', 'hint'], counts: { desc: [1, 1] }, context: 'block' },
    });
    expect(description.tags['Task.Hint']).toMatchObject({ type: 'hint', wrapsLooseInline: true, children: { context: 'block' } });
    expect(description.tags['m']).toMatchObject({ type: 'math', kind: 'inline', usage: 'template', children: { context: 'inline' } });
    expect(description.tags['H1']).toMatchObject({ props: ['level'], preset: ['level'] });
  });
});

describe('gaps found by the Erudit migration', () => {
  it('normalize can re-wrap loose paragraphs in a container that does not accept the autowrap tag', () => {
    const Part = kit.defineBlock({ name: 'part', children: 'block' });
    const Box = kit.defineBlock({
      name: 'box',
      children: { of: [Part], min: 1 },
      normalize: ({ children }) => (children.some((c) => c.type === 'part') ? children : Part({ children: [...children] })),
    });
    const node = Box({ children: ['First paragraph. Second ', <B>bold</B>, '.'] });
    expect(codes(node)).toEqual([]);
    expect(node.children!.map(shape)).toEqual([{ part: [{ paragraph: ['First paragraph.'] }, { paragraph: ['Second ', { bold: ['bold'] }, '.'] }] }]);
  });

  it("children whitespace: 'preserve' keeps text verbatim", () => {
    const Code = defineBlock({ name: 'code', children: { of: 'inline', whitespace: 'preserve' }, data: ({ children }) => ({ text: children.map((c) => (isTextNode(c) ? c.text : '')).join('') }) });
    const source = '  graph TD\n    A --> B\n';
    expect(Code({ children: source }).data).toEqual({ text: source });
  });

  it('state is shared between normalize and data; transient props are not stored', () => {
    const generator = { lines: ['x', 'y'], extra: 42, run() { return this.lines; } };
    const Gen = kit.defineBlock({
      name: 'gen',
      props: { source: s.custom<typeof generator>((v) => typeof v === 'object' && v !== null && 'run' in v), title: s.string() },
      transient: ['source'],
      children: { of: 'block', min: 0 },
      normalize: ({ props, state }) => {
        state.extra = props.source.extra;
        return props.source.run().map((line) => P({ children: line }));
      },
      data: ({ props, state }) => ({ title: props.title, extra: state.extra as number }),
    });
    const node = Gen({ source: generator, title: 'T' });
    expect(node.props).toEqual({ title: 'T' });
    expect(node.data).toEqual({ title: 'T', extra: 42 });
    expect(node.children!.map(shape)).toEqual([{ paragraph: ['x'] }, { paragraph: ['y'] }]);
  });
});

describe('deriveJSON (serve-time derive)', () => {
  it('adds keys and values for matching node types, including nodes in data; caches; does not mutate', async () => {
    const { deriveJSON } = await import('tsprose');
    const Link = defineInline({ name: 'link', props: { to: s.string() }, children: 'inline' });
    const Holder = defineBlock({ name: 'holder', props: { label: s.string() }, data: ({ props }) => ({ option: P({ children: [Link({ to: props.label, children: 'x' })] }) }) });
    const result = await compile([P({ children: [Link({ to: 'a', children: 'A' }), ' and ', Link({ to: 'b', children: 'B' })] }), Holder({ label: 'c' })]);
    const json = toJSON(result);
    let calls = 0;
    const cache = new Map<string, unknown>();
    const derive = { link: (node: BaseNode) => (calls++, `target:${node.props.to as string}`) };
    const out = await deriveJSON(json, derive, { cache });
    expect(Object.values(out.derived ?? {}).sort()).toEqual(['target:a', 'target:b', 'target:c']);
    expect(JSON.stringify(json)).not.toContain('target:');
    const back = fromJSON(out);
    const links: BaseNode[] = [];
    const visit = (n: AnyNode) => { if (!isTextNode(n)) { if (n.type === 'link') links.push(n); n.children?.forEach(visit); } };
    visit(back.root);
    expect(links.map((l) => back.derived.get(l.derived!))).toEqual(['target:a', 'target:b']);
    const opt = ((back.root.children![1] as BaseNode).data as { option: BaseNode }).option;
    expect(back.derived.get((opt.children![0] as BaseNode).derived!)).toBe('target:c');
    await deriveJSON(json, derive, { cache });
    expect(calls).toBe(3); // second run served from the cache
  });
});
