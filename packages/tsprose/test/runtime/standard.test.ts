import { describe, expect, it } from 'vitest';
import { s, hashText, canonicalJson, type Schema } from 'tsprose';
import { validateProps, runSync, compilePattern } from 'tsprose/internal';

describe('s (built-in schemas)', () => {
  it.each([
    ['string', s.string(), 'a', 1],
    ['number', s.number(), 1.5, NaN],
    ['boolean', s.boolean(), false, 'false'],
    ['literal', s.literal('x'), 'x', 'y'],
    ['enum', s.enum([1, 2]), 2, 3],
    ['optional', s.optional(s.string()), undefined, 1],
    ['nullable', s.nullable(s.string()), null, undefined],
    ['array', s.array(s.number()), [1, 2], [1, 'x']],
    ['record', s.record(s.boolean()), { a: true }, { a: 1 }],
    ['union', s.union(s.string(), s.number()), 1, true],
    ['custom', s.custom<Date>((v) => v instanceof Date), new Date(0), 'd'],
  ] as [string, Schema<unknown>, unknown, unknown][])('%s', (_n, schema, good, bad) => {
    expect(runSync(schema, good)).toEqual({ value: good });
    expect(runSync(schema, bad)).toHaveProperty('issues');
    expect(() => schema.parse(bad)).toThrow(TypeError);
  });

  it('object: unknown keys and nested paths', () => {
    const schema = s.object({ a: s.string(), b: s.optional(s.object({ c: s.number() })) });
    expect(runSync(schema, { a: 'x' })).toEqual({ value: { a: 'x' } });
    const r = runSync(schema, { a: 'x', b: { c: 'no' }, z: 1 });
    expect(r.issues!.map((i) => i.path)).toEqual([['b', 'c'], ['z']]);
  });

  it('validateProps separates invalid, unknown and ignored keys', () => {
    const { value, issues } = validateProps({ a: s.string(), b: s.optional(s.number()) }, { a: 'x', c: 1, $: 'r' }, new Set(['$']));
    expect(value).toEqual({ a: 'x' });
    expect(issues).toEqual([{ key: 'c', message: 'Unknown prop "c"' }]);
  });
});

describe('compilePattern', () => {
  it.each([
    ['paragraph+ proof? qed?', ['paragraph'], true],
    ['paragraph+ proof? qed?', ['paragraph', 'paragraph', 'proof', 'qed'], true],
    ['paragraph+ proof? qed?', ['proof'], false],
    ['paragraph+ proof? qed?', ['paragraph', 'qed', 'proof'], false],
    ['main section*', ['main'], true],
    ['main section*', ['main', 'section', 'section'], true],
    ['main section*', ['section'], false],
    ['(text | caption)+', ['text', 'caption', 'text'], true],
    ['(text | caption)+', [], false],
    ['text caption?', ['text'], true],
    ['text caption?', ['text', 'caption'], true],
    ['text caption?', ['caption', 'text'], false],
    ['a (b c)* d', ['a', 'b', 'c', 'b', 'c', 'd'], true],
    ['a (b c)* d', ['a', 'b', 'd'], false],
    ['x*', [], true],
  ])('%s matches %j → %s', (pattern, types, expected) => {
    expect(compilePattern(pattern).test(types)).toBe(expected);
  });

  it('names containing regex characters are escaped', () => {
    expect(compilePattern('a.b-c').test(['a.b-c'])).toBe(true);
    expect(compilePattern('a.b-c').test(['axb-c'])).toBe(false);
  });

  it.each([['(a', 'missing ")"'], ['a)', 'unexpected ")"'], ['', 'empty'], ['a $ b', 'unexpected character'], ['?a', 'unexpected']])(
    'rejects %j',
    (pattern, message) => {
      expect(() => compilePattern(pattern)).toThrow(message);
    },
  );

  it('exposes mentioned names', () => {
    expect([...compilePattern('(a | b)+ c?').names]).toEqual(['a', 'b', 'c']);
  });
});

describe('hashText', () => {
  it('is 16 base62 chars, deterministic and input sensitive', () => {
    expect(hashText('hello')).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(hashText('hello')).toBe(hashText('hello'));
    expect(hashText('hello')).not.toBe(hashText('hello '));
  });

  it('has no collisions on 50k realistic inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) {
      seen.add(hashText(`paragraph:${JSON.stringify({ center: i % 2 === 0 })}:text ${i} ${i * 7919}`));
    }
    expect(seen.size).toBe(50_000);
  });

  it('canonicalJson sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}]},"b":1}');
  });
});
