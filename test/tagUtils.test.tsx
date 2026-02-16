import { describe, expect, it } from 'vitest';

import {
  ensureTagNoChildren,
  ensureTagSingleChild,
  ensureTagSingleBlockChild,
  ensureTagSingleInlinerChild,
  ensureTagChildren,
  ensureTagBlockChildren,
  ensureTagInlinerChildren,
  createTagError,
} from '@src/tagUtils';
import type { NormalizedChildren } from '@src/children';
import type { RawElement } from '@src/element';

import { paragraphSchema, P, B, qedSchema, QED } from './playground.test';

function rawChildren(...tags: JSX.Element[]): NormalizedChildren {
  return tags as unknown as RawElement[];
}

describe('createTagError', () => {
  it('should produce a JSProseError with tag name', () => {
    const err = createTagError('Foo', 'bad stuff');
    expect(err.message).toContain('<Foo>');
    expect(err.message).toContain('bad stuff');
  });
});

describe('ensureTagNoChildren', () => {
  it('should pass when children is undefined', () => {
    expect(() => ensureTagNoChildren('QED', undefined)).not.toThrow();
  });

  it('should throw when children exist', () => {
    expect(() => ensureTagNoChildren('QED', rawChildren(<QED />))).toThrow(
      'cannot have children',
    );
  });
});

describe('ensureTagSingleChild', () => {
  it('should pass with exactly one child', () => {
    expect(() =>
      ensureTagSingleChild('Test', rawChildren(<QED />)),
    ).not.toThrow();
  });

  it('should throw when no children', () => {
    expect(() => ensureTagSingleChild('Test', undefined)).toThrow(
      'exactly one child',
    );
  });

  it('should throw when multiple children', () => {
    expect(() =>
      ensureTagSingleChild('Test', rawChildren(<QED />, <QED />)),
    ).toThrow('exactly one child');
  });

  it('should validate schema when provided', () => {
    expect(() =>
      ensureTagSingleChild('Test', rawChildren(<QED />), qedSchema),
    ).not.toThrow();
    expect(() =>
      ensureTagSingleChild('Test', rawChildren(<QED />), paragraphSchema),
    ).toThrow();
  });
});

describe('ensureTagSingleBlockChild / ensureTagSingleInlinerChild', () => {
  it('should accept a single block child', () => {
    expect(() =>
      ensureTagSingleBlockChild('Test', rawChildren(<QED />)),
    ).not.toThrow();
  });

  it('should reject inliner as block child', () => {
    expect(() =>
      ensureTagSingleBlockChild('Test', rawChildren(<B>x</B>)),
    ).toThrow('block child');
  });

  it('should accept a single inliner child', () => {
    expect(() =>
      ensureTagSingleInlinerChild('Test', rawChildren(<B>x</B>)),
    ).not.toThrow();
  });

  it('should reject block as inliner child', () => {
    expect(() =>
      ensureTagSingleInlinerChild('Test', rawChildren(<QED />)),
    ).toThrow('inliner child');
  });
});

describe('ensureTagChildren', () => {
  it('should throw when children is undefined', () => {
    expect(() => ensureTagChildren('Test', undefined)).toThrow(
      'requires child elements',
    );
  });

  it('should pass any children when no schemas given', () => {
    expect(() =>
      ensureTagChildren('Test', rawChildren(<QED />, <B>hi</B>)),
    ).not.toThrow();
  });

  it('should filter by a single schema', () => {
    expect(() =>
      ensureTagChildren('Test', rawChildren(<QED />), qedSchema),
    ).not.toThrow();
    expect(() =>
      ensureTagChildren('Test', rawChildren(<B>x</B>), qedSchema),
    ).toThrow('cannot have "bold" child');
  });

  it('should filter by multiple schemas', () => {
    expect(() =>
      ensureTagChildren('Test', rawChildren(<QED />, <P>text</P>), [
        qedSchema,
        paragraphSchema,
      ]),
    ).not.toThrow();
    expect(() =>
      ensureTagChildren('Test', rawChildren(<B>x</B>), [
        qedSchema,
        paragraphSchema,
      ]),
    ).toThrow('cannot have "bold" child');
  });
});

describe('ensureTagBlockChildren / ensureTagInlinerChildren', () => {
  it('should accept all-block children', () => {
    expect(() =>
      ensureTagBlockChildren('Test', rawChildren(<QED />, <P>hi</P>)),
    ).not.toThrow();
  });

  it('should reject inliner among blocks', () => {
    expect(() =>
      ensureTagBlockChildren('Test', rawChildren(<QED />, <B>x</B>)),
    ).toThrow('inliner child');
  });

  it('should accept all-inliner children', () => {
    expect(() =>
      ensureTagInlinerChildren('Test', rawChildren(<B>a</B>)),
    ).not.toThrow();
  });

  it('should reject block among inliners', () => {
    expect(() =>
      ensureTagInlinerChildren('Test', rawChildren(<QED />)),
    ).toThrow('block child');
  });
});
