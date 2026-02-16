import { describe, it, expect, expectTypeOf } from 'vitest';

import { defineSchema, SCHEMA_PREFIX, type Schema } from '@src/schema';

describe('defineSchema', () => {
  it('should infer correct types', () => {
    interface TextSchema extends Schema {
      name: 'text';
      type: 'inliner';
      linkable: 'always';
      Children: TextSchema[];
    }

    const schema = defineSchema<TextSchema>({
      name: 'text',
      type: 'inliner',
      linkable: 'always',
    });

    expect(schema).toEqual({
      name: 'text',
      type: 'inliner',
      linkable: 'always',
      [SCHEMA_PREFIX]: true,
    });
    expectTypeOf<typeof schema>().toEqualTypeOf<TextSchema>();
  });
});
