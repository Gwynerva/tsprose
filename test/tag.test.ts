import { describe, expect, it } from 'vitest';

import { defineTag } from '@src/tag';
import { textSchema } from '@src/default/text';

describe('defineTag', () => {
  it('should throw error for invalid tag name', () => {
    expect(() =>
      defineTag({
        tagName: '    ',
        schema: textSchema,
      }),
    ).toThrowError();
  });
});
