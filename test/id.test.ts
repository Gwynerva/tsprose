import { describe, expect, it } from 'vitest';

import { defaultIdMaker, type TakenIds } from '@src/id';
import { makeRawElement, makeProseElement } from '@src/elementUtils';

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
    expect(defaultIdMaker({ rawElement: slugRawElement })).toBe('hello-world');
    expect(defaultIdMaker({ rawElement: uniqueNameRawElement })).toBe(
      'my-unique-paragraph',
    );
    expect(defaultIdMaker({ rawElement })).toBe(
      rawElement.schema.name + '-' + rawElement.hash.substring(0, 9),
    );
  });

  it('should find next available id for non-unique elements', () => {
    const collidingProse1 = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (el) => {
        el.id = 'hello-world';
      },
    });
    const collidingProse2 = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (el) => {
        el.id = 'hello-world-1';
      },
    });
    const takenIds: TakenIds = new Map([
      ['hello-world', collidingProse1],
      ['hello-world-1', collidingProse2],
    ]);
    expect(defaultIdMaker({ rawElement: slugRawElement, takenIds })).toBe(
      'hello-world-2',
    );
  });

  it('should keep unique id and rename colliding element', () => {
    const collidingProse = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (el) => {
        el.id = 'my-unique-paragraph';
      },
    });
    const takenIds: TakenIds = new Map([
      ['my-unique-paragraph', collidingProse],
    ]);

    const result = defaultIdMaker({
      rawElement: uniqueNameRawElement,
      takenIds,
    });

    // Unique element keeps its id untouched
    expect(result).toBe('my-unique-paragraph');

    // Colliding element was renamed to schema.name + '-' + oldId
    expect(collidingProse.id).toBe('paragraph-my-unique-paragraph');
    expect(takenIds.has('paragraph-my-unique-paragraph')).toBe(true);
    expect(takenIds.get('paragraph-my-unique-paragraph')).toBe(collidingProse);

    // Original id slot is now free for the unique element
    expect(takenIds.has('my-unique-paragraph')).toBe(false);
  });

  it('should append -1 to colliding prose when renamed id is also taken', () => {
    const collidingProse = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (el) => {
        el.id = 'my-unique-paragraph';
      },
    });
    const existingProse = makeProseElement({
      schema: paragraphSchema,
      elementHandler: (el) => {
        el.id = 'paragraph-my-unique-paragraph';
      },
    });
    const takenIds: TakenIds = new Map([
      ['my-unique-paragraph', collidingProse],
      ['paragraph-my-unique-paragraph', existingProse],
    ]);

    const result = defaultIdMaker({
      rawElement: uniqueNameRawElement,
      takenIds,
    });

    // Unique element keeps its id
    expect(result).toBe('my-unique-paragraph');

    // Colliding element gets -1 since paragraph-my-unique-paragraph is already taken
    expect(collidingProse.id).toBe('paragraph-my-unique-paragraph-1');
    expect(takenIds.has('paragraph-my-unique-paragraph-1')).toBe(true);
    expect(takenIds.get('paragraph-my-unique-paragraph-1')).toBe(
      collidingProse,
    );

    // Existing prose at the renamed slot is unaffected
    expect(takenIds.get('paragraph-my-unique-paragraph')).toBe(existingProse);

    // Original id slot is now free for the unique element
    expect(takenIds.has('my-unique-paragraph')).toBe(false);
  });
});
