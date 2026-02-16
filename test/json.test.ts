import { describe, expect, it } from 'vitest';

import { toJSON, fromJSON } from '@src/json';
import { RAW_ELEMENT_PREFIX, PROSE_ELEMENT_PREFIX } from '@src/element';
import { defineSchema, SCHEMA_PREFIX } from '@src/schema';
import { textSchema } from '@src/default/text';

import { paragraphSchema } from './playground.test';

function rawElement(
  schema: ReturnType<typeof defineSchema>,
  data: unknown,
  children?: unknown[],
) {
  return {
    [RAW_ELEMENT_PREFIX]: true,
    schema,
    hash: 'abc123',
    data,
    storageKey: undefined,
    children,
  };
}

function proseElement(
  schema: ReturnType<typeof defineSchema>,
  data: unknown,
  children?: unknown[],
) {
  return {
    [PROSE_ELEMENT_PREFIX]: true,
    schema,
    id: 'id-1',
    data,
    storageKey: undefined,
    children,
  };
}

describe('toJSON', () => {
  it('should serialize a raw element and encode its schema', () => {
    const el = rawElement(textSchema, 'hello');
    const json = toJSON(el);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual({
      [RAW_ELEMENT_PREFIX]: 'text10',
      hash: 'abc123',
      data: 'hello',
    });
  });

  it('should serialize a prose element and encode its schema', () => {
    const el = proseElement(textSchema, 'world');
    const json = toJSON(el);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual({
      [PROSE_ELEMENT_PREFIX]: 'text10',
      id: 'id-1',
      data: 'world',
    });
  });

  it('should encode block schema type correctly', () => {
    const el = rawElement(paragraphSchema, undefined, []);
    const json = toJSON(el);
    const parsed = JSON.parse(json);

    // paragraph: block (0), linkable true (1)
    expect(parsed[RAW_ELEMENT_PREFIX]).toBe('paragraph01');
  });

  it('should encode linkable=always correctly', () => {
    const alwaysLinkable = defineSchema({
      name: 'link',
      type: 'inliner',
      linkable: 'always',
    });
    const el = rawElement(alwaysLinkable, {}, []);
    const json = toJSON(el);
    const parsed = JSON.parse(json);

    // link: inliner (1), linkable always (2)
    expect(parsed[RAW_ELEMENT_PREFIX]).toBe('link12');
  });

  it('should handle nested elements', () => {
    const child = rawElement(textSchema, 'child');
    const parent = rawElement(paragraphSchema, undefined, [child]);
    const json = toJSON(parent);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual({
      [RAW_ELEMENT_PREFIX]: 'paragraph01',
      hash: 'abc123',
      children: [
        {
          [RAW_ELEMENT_PREFIX]: 'text10',
          hash: 'abc123',
          data: 'child',
        },
      ],
    });
  });

  it('should support indent parameter', () => {
    const el = rawElement(textSchema, 'hello');
    const json = toJSON(el, 2);

    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  it('should not touch plain objects without element prefixes', () => {
    const plain = { schema: { name: 'foo' }, data: 'bar', nested: { x: 1 } };
    const json = toJSON(plain);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(plain);
  });

  it('should not touch objects with prefix key set to non-true values', () => {
    const fake = {
      [RAW_ELEMENT_PREFIX]: false,
      schema: { name: 'fake' },
      data: 'sneaky',
    };
    const json = toJSON(fake);
    const parsed = JSON.parse(json);

    // Schema should remain untouched since the prefix value is not true
    expect(parsed).toEqual(fake);
  });

  it('should not touch objects with prefix key set to a string', () => {
    const fake = {
      [RAW_ELEMENT_PREFIX]: 'not-true',
      schema: { name: 'fake' },
      data: 'sneaky',
    };
    const json = toJSON(fake);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(fake);
  });

  it('should serialize an array of elements', () => {
    const elements = [
      rawElement(textSchema, 'first'),
      rawElement(textSchema, 'second'),
    ];
    const json = toJSON(elements);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(2);
    expect(parsed[0][RAW_ELEMENT_PREFIX]).toBe('text10');
    expect(parsed[1][RAW_ELEMENT_PREFIX]).toBe('text10');
  });

  it('should preserve non-element siblings in mixed data', () => {
    const mixed = {
      title: 'Hello',
      count: 42,
      element: rawElement(textSchema, 'text content'),
    };
    const json = toJSON(mixed);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual({
      title: 'Hello',
      count: 42,
      element: {
        [RAW_ELEMENT_PREFIX]: 'text10',
        hash: 'abc123',
        data: 'text content',
      },
    });
  });
});

describe('fromJSON', () => {
  it('should deserialize a raw element and restore its schema', () => {
    const el = rawElement(textSchema, 'hello');
    const json = toJSON(el);
    const restored = fromJSON(json);

    expect(restored).toEqual({
      [RAW_ELEMENT_PREFIX]: true,
      schema: {
        [SCHEMA_PREFIX]: true,
        name: 'text',
        type: 'inliner',
        linkable: false,
      },
      hash: 'abc123',
      data: 'hello',
    });
  });

  it('should deserialize a prose element and restore its schema', () => {
    const el = proseElement(textSchema, 'world');
    const json = toJSON(el);
    const restored = fromJSON(json);

    expect(restored).toEqual({
      [PROSE_ELEMENT_PREFIX]: true,
      schema: {
        [SCHEMA_PREFIX]: true,
        name: 'text',
        type: 'inliner',
        linkable: false,
      },
      id: 'id-1',
      data: 'world',
    });
  });

  it('should decode block type correctly', () => {
    const el = rawElement(paragraphSchema, undefined, []);
    const json = toJSON(el);
    const restored = fromJSON(json);

    expect(restored.schema).toEqual({
      [SCHEMA_PREFIX]: true,
      name: 'paragraph',
      type: 'block',
      linkable: true,
    });
  });

  it('should decode linkable=always correctly', () => {
    const alwaysLinkable = defineSchema({
      name: 'link',
      type: 'inliner',
      linkable: 'always',
    });
    const el = rawElement(alwaysLinkable, {}, []);
    const json = toJSON(el);
    const restored = fromJSON(json);

    expect(restored.schema).toEqual({
      [SCHEMA_PREFIX]: true,
      name: 'link',
      type: 'inliner',
      linkable: 'always',
    });
  });

  it('should handle nested elements', () => {
    const child = rawElement(textSchema, 'child');
    const parent = rawElement(paragraphSchema, undefined, [child]);
    const json = toJSON(parent);
    const restored = fromJSON(json);

    expect(restored.children).toEqual([
      {
        [RAW_ELEMENT_PREFIX]: true,
        schema: {
          [SCHEMA_PREFIX]: true,
          name: 'text',
          type: 'inliner',
          linkable: false,
        },
        hash: 'abc123',
        data: 'child',
      },
    ]);
  });

  it('should not touch plain objects without element prefixes', () => {
    const obj = { schema: { name: 'foo' }, data: 'bar' };
    const restored = fromJSON(JSON.stringify(obj));

    expect(restored).toEqual(obj);
  });

  it('should not touch prefix keys with non-string values', () => {
    const obj = { [RAW_ELEMENT_PREFIX]: 42, data: 'hello' };
    const restored = fromJSON(JSON.stringify(obj));

    // Should remain as-is since the value isn't a string
    expect(restored).toEqual(obj);
  });

  it('should roundtrip elements correctly', () => {
    const child1 = rawElement(textSchema, 'hello');
    const child2 = rawElement(textSchema, 'world');
    const parent = rawElement(paragraphSchema, { serif: true }, [
      child1,
      child2,
    ]);

    const json = toJSON(parent);
    const restored = fromJSON(json);

    expect(restored).toEqual(parent);
  });

  it('should roundtrip prose elements correctly', () => {
    const el = proseElement(paragraphSchema, { center: true }, [
      proseElement(textSchema, 'content'),
    ]);

    const json = toJSON(el);
    const restored = fromJSON(json);

    expect(restored).toEqual(el);
  });
});
