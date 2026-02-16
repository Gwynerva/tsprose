import { describe, expect, it } from 'vitest';

import {
  isRawElement,
  isProseElement,
  ensureRawElement,
  ensureProseElement,
  isRawBlock,
  isRawInliner,
  isProseBlock,
  isProseInliner,
  ensureRawBlock,
  ensureRawInliner,
  ensureProseBlock,
  ensureProseInliner,
  hasChildren,
  ensureChildren,
  makeRawElement,
  makeProseElement,
} from '@src/elementUtils';

import {
  paragraphSchema,
  P,
  B,
  boldSchema,
  qedSchema,
  QED,
  type ParagraphRawElement,
} from './playground.test';

describe('makeRawElement', () => {
  it('should produce a raw element with hash', () => {
    const el = makeRawElement({ schema: qedSchema, tagName: 'QED' });
    expect(el.__TSPROSE_rawElement).toBe(true);
    expect(el.schema.name).toBe('qed');
    expect(el.tagName).toBe('QED');
    expect(el.hash).toBeTypeOf('string');
    expect(el.hash.length).toBe(12);
  });

  it('should allow setting data via elementHandler', () => {
    const el = makeRawElement({
      schema: paragraphSchema,
      tagName: 'P',
      elementHandler: (element) => {
        element.data = { serif: true };
      },
    });
    expect(el.data).toEqual({ serif: true });
  });
});

describe('makeProseElement', () => {
  it('should produce a prose element', () => {
    const el = makeProseElement({ schema: paragraphSchema });
    expect(el.__TSPROSE_proseElement).toBe(true);
    expect(el.schema.name).toBe('paragraph');
    expect(el.schema.type).toBe('block');
  });

  it('should allow setting data via elementHandler', () => {
    const el = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (element) => {
        element.data = { serif: true };
      },
    });
    expect(el.data).toEqual({ serif: true });
  });

  it('should produce an inliner prose element', () => {
    const el = makeProseElement({ schema: boldSchema });
    expect(el.__TSPROSE_proseElement).toBe(true);
    expect(el.schema.name).toBe('bold');
    expect(el.schema.type).toBe('inliner');
  });
});

describe('isRawElement / isProseElement', () => {
  it('should identify raw elements', () => {
    const raw = (<QED />) as any;
    expect(isRawElement(raw)).toBe(true);
    expect(isProseElement(raw)).toBe(false);
  });

  it('should filter by schema when provided', () => {
    const raw = (<QED />) as any;
    expect(isRawElement(raw, qedSchema)).toBe(true);
    expect(isRawElement(raw, paragraphSchema)).toBe(false);
  });

  it('should identify prose elements', () => {
    const prose = makeProseElement({ schema: paragraphSchema });
    expect(isProseElement(prose)).toBe(true);
    expect(isRawElement(prose)).toBe(false);
  });

  it('should return false for non-elements', () => {
    expect(isRawElement(null)).toBe(false);
    expect(isRawElement('hello')).toBe(false);
    expect(isRawElement({})).toBe(false);
    expect(isProseElement(undefined)).toBe(false);
  });
});

describe('ensureRawElement / ensureProseElement', () => {
  it('should not throw for valid elements', () => {
    const raw = (<QED />) as any;
    expect(() => ensureRawElement(raw)).not.toThrow();
    expect(() => ensureRawElement(raw, qedSchema)).not.toThrow();

    const prose = makeProseElement({ schema: qedSchema });
    expect(() => ensureProseElement(prose)).not.toThrow();
  });

  it('should throw for invalid elements', () => {
    expect(() => ensureRawElement({})).toThrow();
    expect(() => ensureRawElement(<QED />, paragraphSchema)).toThrow();
    expect(() => ensureProseElement({})).toThrow();
  });
});

describe('isRaw/ProseBlock / isRaw/ProseInliner', () => {
  it('should differentiate block vs inliner raw elements', () => {
    const block = (<QED />) as any;
    const inliner = (<B>hello</B>) as any;

    expect(isRawBlock(block)).toBe(true);
    expect(isRawInliner(block)).toBe(false);
    expect(isRawInliner(inliner)).toBe(true);
    expect(isRawBlock(inliner)).toBe(false);
  });

  it('should differentiate block vs inliner prose elements', () => {
    const proseBlock = makeProseElement({ schema: paragraphSchema });
    const proseInliner = makeProseElement({ schema: boldSchema });

    expect(isProseBlock(proseBlock)).toBe(true);
    expect(isProseInliner(proseBlock)).toBe(false);
    expect(isProseInliner(proseInliner)).toBe(true);
    expect(isProseBlock(proseInliner)).toBe(false);
  });

  it('should return false for non-elements', () => {
    expect(isRawBlock(null)).toBe(false);
    expect(isRawInliner(42)).toBe(false);
    expect(isProseBlock(undefined)).toBe(false);
  });
});

describe('ensureRaw/ProseBlock / ensureRaw/ProseInliner', () => {
  it('should not throw for correct types', () => {
    expect(() => ensureRawBlock(<QED />)).not.toThrow();
    expect(() => ensureRawInliner(<B>x</B>)).not.toThrow();
    expect(() =>
      ensureProseBlock(makeProseElement({ schema: paragraphSchema })),
    ).not.toThrow();
    expect(() =>
      ensureProseInliner(makeProseElement({ schema: boldSchema })),
    ).not.toThrow();
  });

  it('should throw for wrong types', () => {
    expect(() => ensureRawBlock(<B>x</B>)).toThrow('raw block');
    expect(() => ensureRawInliner(<QED />)).toThrow('raw inliner');
    expect(() =>
      ensureProseBlock(makeProseElement({ schema: boldSchema })),
    ).toThrow('prose block');
    expect(() =>
      ensureProseInliner(makeProseElement({ schema: paragraphSchema })),
    ).toThrow('prose inliner');
  });
});

describe('hasChildren / ensureChildren', () => {
  it('should detect presence of children', () => {
    const el = (<P>Hello</P>) as ParagraphRawElement;
    expect(hasChildren(el)).toBe(true);

    const noKids = (<QED />) as any;
    expect(hasChildren(noKids)).toBe(false);

    expect(hasChildren({ children: [] })).toBe(false);
    expect(hasChildren({})).toBe(false);
  });

  it('should throw or pass via ensureChildren', () => {
    const el = (<P>Hello</P>) as ParagraphRawElement;
    expect(() => ensureChildren(el)).not.toThrow();
    expect(() => ensureChildren({ children: [] })).toThrow('no children');
    expect(() => ensureChildren({})).toThrow('no children');
  });
});
