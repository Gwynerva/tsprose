import { describe, expect, it } from 'vitest';

import { defaultIdMaker } from '@src/id';
import { makeRawElement } from '@src/elementUtils';

import { paragraphSchema } from './playground.test';

describe('defaultIdMaker', () => {
  const slugRawElement = makeRawElement({
    schema: paragraphSchema,
    elementHandler: (element) => {
      element.slug = 'hello-world';
    },
  });

  const uniqueNameRawElement = makeRawElement({
    schema: paragraphSchema,
    elementHandler: (element) => {
      element.uniqueName = 'my-unique-paragraph';
    },
  });

  const rawElement = makeRawElement({
    schema: paragraphSchema,
  });

  it('should return as is without takenIds', () => {
    expect(defaultIdMaker(slugRawElement)).toBe('hello-world');
    expect(defaultIdMaker(uniqueNameRawElement)).toBe('my-unique-paragraph');
    expect(defaultIdMaker(rawElement)).toBe(
      rawElement.schema.name + '-' + rawElement.hash.substring(0, 9),
    );
  });

  it('should ensure uniqueness with takenIds', () => {
    const takenIds = new Set([
      'hello-world',
      'hello-world-1',
      'my-unique-paragraph',
    ]);
    expect(defaultIdMaker(slugRawElement, takenIds)).toBe('hello-world-2');
    expect(defaultIdMaker(uniqueNameRawElement, takenIds)).toBe(
      'my-unique-paragraph-1',
    );
    expect(takenIds).toEqual(
      new Set(['hello-world', 'hello-world-1', 'my-unique-paragraph']),
    );
  });
});
