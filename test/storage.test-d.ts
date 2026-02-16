import { describe, expectTypeOf, it } from 'vitest';

import type { ElementStorageCreator } from '@src/storage';
import { defineSchema, type BlockSchema, type Schema } from '@src/schema';
import type { ProseElement, ToProseElement } from '@src/element';

describe('ElementStorageCreator', () => {
  it('should infer element storage type from schema', () => {
    interface WithStorageSchema extends BlockSchema {
      name: 'withStorage';
      type: 'block';
      linkable: false;
      Data: undefined;
      Storage: { value: number };
      Children: undefined;
    }

    const schemaWithStorage = defineSchema<WithStorageSchema>({
      name: 'withStorage',
      type: 'block',
      linkable: false,
    });

    type StorageResult = ElementStorageCreator<typeof schemaWithStorage>;

    expectTypeOf<StorageResult>().toEqualTypeOf<
      (
        element: ToProseElement<typeof schemaWithStorage>,
      ) => { value: number } | null | Promise<{ value: number } | null>
    >();
  });

  it('should allow creating storage for general Schema', () => {
    type StorageResult = ElementStorageCreator<Schema>;
    expectTypeOf<StorageResult>().toEqualTypeOf<
      (element: ProseElement) => any
    >();
  });

  it('should not allow returning anything for schemas without storage', () => {
    interface WithoutStorageSchema extends BlockSchema {
      name: 'withoutStorage';
      type: 'block';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: undefined;
    }

    const schemaWithoutStorage = defineSchema<WithoutStorageSchema>({
      name: 'withoutStorage',
      type: 'block',
      linkable: false,
    });

    expectTypeOf<
      ElementStorageCreator<typeof schemaWithoutStorage>
    >().toEqualTypeOf<never>();
  });
});
