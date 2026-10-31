import { describe, expect, it } from 'vitest';
import { defineBlock, defineInline, defineRefs, isTag, s, getRefHandle, type BaseNode, REF } from 'tsprose';
import { B, H1, H2, Heading, Image, P, Qed, Theorem, Details } from '../fixtures/tags.js';

const codes = (node: BaseNode) => (node.diagnostics ?? []).map((d) => d.code);

describe('defineBlock / defineInline', () => {
  it('creates branded callable tags with normalized defs', () => {
    expect(isTag(P)).toBe(true);
    expect(isTag(() => null)).toBe(false);
    expect(P.def).toMatchObject({ name: 'paragraph', kind: 'block', children: 'inline', ref: 'optional' });
    expect(Qed.def).toMatchObject({ name: 'qed', kind: 'block', children: 'none', ref: 'none', props: {} });
    expect(P.name).toBe('paragraph');
  });

  it.each([['', 'Invalid tag name'], ['1x', 'Invalid tag name'], ['text', 'reserved'], ['fragment', 'reserved']])(
    'rejects bad names (%s)',
    (name, message) => {
      expect(() => defineBlock({ name: name as 'x' })).toThrow(message);
    },
  );

  it('rejects block children on inline tags', () => {
    expect(() => defineInline({ name: 'x', children: 'block' as never })).toThrow('cannot accept block children');
  });

  it('rejects patterns mentioning unknown types', () => {
    const T = defineBlock({ name: 'bad', children: { of: [P], pattern: 'paragraph qed' } });
    expect(() => T({ children: <P>x</P> })).toThrow('not in its children list');
  });
});

describe('props', () => {
  it('validates and keeps only own props', () => {
    const node = P({ center: true, children: 'x' });
    expect(node.props).toEqual({ center: true });
    expect(node.data).toEqual({ center: true });
    expect(node.diagnostics).toBeUndefined();
  });

  it('reports invalid and unknown props without throwing', () => {
    const node = P({ center: 'yes', bogus: 1, children: 'x' } as never);
    expect(codes(node)).toEqual(['props/invalid', 'props/unknown']);
    expect(node.diagnostics![0]!.message).toContain('center');
    expect(node.diagnostics![1]!.message).toContain('bogus');
  });

  it('data() errors become diagnostics', () => {
    const Boom = defineBlock({
      name: 'boom',
      data: () => {
        throw new Error('nope');
      },
    });
    const node = Boom({});
    expect(codes(node)).toEqual(['tag/data']);
    expect(node.diagnostics![0]!.message).toContain('nope');
  });

  it('presets via with()', () => {
    expect(H1({ children: 'Title' }).props).toEqual({ level: 1 });
    expect(H2({ children: 'Title' }).props).toEqual({ level: 2 });
    expect(H1.def).toBe(Heading.def);
    const node = Heading({ level: 3, children: 'x' });
    expect(node.props.level).toBe(3);
    expect(codes(Heading({ level: 4 as 1, children: 'x' }))).toEqual(['props/invalid']);
  });
});

describe('refs ($)', () => {
  it('string refs are accepted on referable tags', () => {
    const node = P({ $: 'intro', children: 'x' });
    expect(node.ref).toBe('intro');
    expect(getRefHandle(node)).toBeUndefined();
  });

  it('required refs are enforced', () => {
    expect(codes(Theorem({ title: 'T', children: <P>x</P> } as never))).toEqual(['ref/required']);
    expect(codes(Details({ children: <Qed /> } as never))).toEqual(['ref/required']);
  });

  it('refs are forbidden on non-referable tags', () => {
    expect(codes(Qed({ $: 'x' } as never))).toEqual(['ref/forbidden']);
  });

  it('handles must belong to the same definition', () => {
    const refs = defineRefs('file:///doc/refs.ts', { thm: Theorem, par: P, h: Heading });
    const ok = Theorem({ $: refs.thm, title: 'T', children: <P>x</P> });
    expect(ok.ref).toBe('thm');
    expect(getRefHandle(ok)).toBe(refs.thm);
    expect(refs.thm[REF]).toBe(true);
    expect(refs.thm.scope.url).toBe('file:///doc/refs.ts');

    const wrong = Theorem({ $: refs.par as never, title: 'T', children: <P>x</P> });
    expect(codes(wrong)).toEqual(['ref/mismatch']);

    // preset tags share the def → handles for the base tag work
    const h = H1({ $: refs.h, children: 'x' });
    expect(h.ref).toBe('h');
  });

  it('defineRefs rejects non-referable tags', () => {
    expect(() => defineRefs({ q: Qed } as never)).toThrow("ref mode is 'none'");
  });

  it('empty and invalid $ are diagnostics', () => {
    expect(codes(P({ $: '  ', children: 'x' }))).toEqual(['ref/invalid']);
    expect(codes(P({ $: 42 as never, children: 'x' }))).toEqual(['ref/invalid']);
  });
});

describe('derive / key metadata on defs', () => {
  it('is stored on the def for compile to use', async () => {
    expect(typeof Image.def.key).toBe('function');
    expect(typeof Image.def.derive).toBe('function');
    const node = Image({ src: 'cat.png' });
    expect(Image.def.key!(node)).toBe('cat.png');
    await expect(Image.def.derive!(node, { context: undefined })).resolves.toEqual({ bytes: 700 });
  });
});

describe('standard schema interop', () => {
  it('accepts a foreign Standard Schema object', () => {
    const fake = {
      '~standard': {
        version: 1 as const,
        vendor: 'fake',
        validate: (v: unknown) => (v === 'ok' ? { value: 'ok' as const } : { issues: [{ message: 'must be ok' }] }),
        types: undefined as { input: 'ok'; output: 'ok' } | undefined,
      },
    };
    const T = defineBlock({ name: 'foreign', props: { v: fake } });
    expect(T({ v: 'ok' }).props).toEqual({ v: 'ok' });
    expect(codes(T({ v: 'no' } as never))).toEqual(['props/invalid']);
  });

  it('rejects async validators with a diagnostic', () => {
    const asyncSchema = { '~standard': { version: 1 as const, vendor: 'x', validate: async (v: unknown) => ({ value: v }) } };
    const T = defineBlock({ name: 'asyncprops', props: { v: s.optional(asyncSchema) } });
    expect(codes(T({ v: 1 }))).toEqual(['props/invalid']);
    expect(T({ v: 1 }).diagnostics![0]!.message).toContain('Async');
  });

  it('B accent flag', () => {
    expect(B({ accent: true, children: 'x' }).props).toEqual({ accent: true });
  });
});
