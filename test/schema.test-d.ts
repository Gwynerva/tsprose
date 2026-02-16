import { describe, it, expectTypeOf } from 'vitest';

import type {
  BlockSchema,
  LinkableSchema,
  InlinerSchema,
  Schema,
} from '@src/schema';

describe('Schema', () => {
  it('should respect inheritance rules across predefined schemas', () => {
    expectTypeOf<InlinerSchema>().toExtend<Schema>();
    expectTypeOf<Schema>().not.toExtend<InlinerSchema>();

    expectTypeOf<BlockSchema>().toExtend<Schema>();
    expectTypeOf<Schema>().not.toExtend<BlockSchema>();

    expectTypeOf<InlinerSchema>().not.toExtend<BlockSchema>();
    expectTypeOf<BlockSchema>().not.toExtend<InlinerSchema>();

    expectTypeOf<LinkableSchema>().toExtend<Schema>();
  });

  it('should respect inheritance rules across user-defined schemas', () => {
    interface TextSchema extends InlinerSchema {
      name: 'text';
      linkable: 'always';
      Data: string;
      Children: undefined;
    }

    interface ParagraphSchema extends BlockSchema {
      name: 'paragraph';
      Children: (TextSchema | ParagraphSchema)[] | undefined;
    }

    expectTypeOf<TextSchema>().toExtend<InlinerSchema>();
    expectTypeOf<InlinerSchema>().not.toExtend<TextSchema>();

    expectTypeOf<ParagraphSchema>().toExtend<BlockSchema>();
    expectTypeOf<BlockSchema>().not.toExtend<ParagraphSchema>();

    expectTypeOf<TextSchema>().not.toExtend<ParagraphSchema>();
    expectTypeOf<ParagraphSchema>().not.toExtend<TextSchema>();

    expectTypeOf<TextSchema>().toExtend<Schema>();
    expectTypeOf<ParagraphSchema>().toExtend<Schema>();

    expectTypeOf<TextSchema>().toExtend<LinkableSchema>();
    expectTypeOf<ParagraphSchema>().not.toExtend<LinkableSchema>();
  });
});
