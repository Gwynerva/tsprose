import { describe, it, expectTypeOf } from 'vitest';

import type { BlockSchema, InlinerSchema } from '@src/schema';
import type {
  ToRawElement,
  RawElement,
  BlockRawElement,
  InlinerRawElement,
  LinkableRawElement,
} from '@src/element';

interface FooSchema extends InlinerSchema {
  name: 'foo';
  linkable: false;
  Data: { foo: string };
  Storage: undefined;
  Children: undefined;
}

interface BarSchema extends InlinerSchema {
  name: 'bar';
  linkable: false;
  Data: { bar: number };
  Storage: undefined;
  Children: undefined;
}

interface TextSchema extends InlinerSchema {
  name: 'text';
  linkable: 'always';
  Data: string;
  Storage: undefined;
  Children: undefined;
}

interface ParagraphSchema extends BlockSchema {
  name: 'paragraph';
  linkable: false;
  Data: undefined;
  Storage: undefined;
  Children: (TextSchema | ParagraphSchema)[] | undefined;
}

describe('Raw Element', () => {
  it('should respect inheritance rules across predefined schemas', () => {
    expectTypeOf<InlinerRawElement>().toExtend<RawElement>();
    expectTypeOf<RawElement>().not.toExtend<InlinerRawElement>();

    expectTypeOf<BlockRawElement>().toExtend<RawElement>();
    expectTypeOf<RawElement>().not.toExtend<BlockRawElement>();

    expectTypeOf<InlinerRawElement>().not.toExtend<BlockRawElement>();
    expectTypeOf<BlockRawElement>().not.toExtend<InlinerRawElement>();

    expectTypeOf<LinkableRawElement>().toExtend<RawElement>();
  });

  it('should respect inheritance rules across user-defined schemas', () => {
    type TextRaw = ToRawElement<TextSchema>;
    type ParagraphRaw = ToRawElement<ParagraphSchema>;

    expectTypeOf<TextRaw>().toExtend<InlinerRawElement>();
    expectTypeOf<InlinerRawElement>().not.toExtend<TextRaw>();

    expectTypeOf<ParagraphRaw>().toExtend<BlockRawElement>();
    expectTypeOf<BlockRawElement>().not.toExtend<ParagraphRaw>();

    expectTypeOf<TextRaw>().not.toExtend<ParagraphRaw>();
    expectTypeOf<ParagraphRaw>().not.toExtend<TextRaw>();

    expectTypeOf<TextRaw>().toExtend<RawElement>();
    expectTypeOf<ParagraphRaw>().toExtend<RawElement>();

    expectTypeOf<TextRaw>().toExtend<LinkableRawElement>();
    expectTypeOf<ParagraphRaw>().not.toExtend<LinkableRawElement>();
  });
});

describe('Children transformation', () => {
  it('undefined -> undefined', () => {
    interface LeafSchema extends BlockSchema {
      name: 'leaf';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: undefined;
    }

    expectTypeOf<
      ToRawElement<LeafSchema>['children']
    >().toEqualTypeOf<undefined>();
  });

  it('Schema[] | undefined -> RawElement[] | undefined', () => {
    expectTypeOf<RawElement['children']>().toEqualTypeOf<
      RawElement[] | undefined
    >();
  });

  it('[FooSchema, BarSchema] -> [FooRawElement, BarRawElement]', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: [FooSchema, BarSchema];
    }

    type Children = ToRawElement<ParentSchema>['children'];

    expectTypeOf<Children>().toEqualTypeOf<
      [ToRawElement<FooSchema>, ToRawElement<BarSchema>]
    >();
  });

  it('[FooSchema, BarSchema] | undefined -> [FooRawElement, BarRawElement] | undefined', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: [FooSchema, BarSchema] | undefined;
    }

    type Children = ToRawElement<ParentSchema>['children'];

    expectTypeOf<Children>().toEqualTypeOf<
      [ToRawElement<FooSchema>, ToRawElement<BarSchema>] | undefined
    >();
  });

  it('SingleSchema[] -> ToRawElement<SingleSchema>[]', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: FooSchema[];
    }

    expectTypeOf<ToRawElement<ParentSchema>['children']>().toEqualTypeOf<
      ToRawElement<FooSchema>[]
    >();
  });

  it('(FooSchema | BarSchema)[] -> (ToRawElement<Foo> | ToRawElement<Bar>)[]', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: (FooSchema | BarSchema)[];
    }

    expectTypeOf<ToRawElement<ParentSchema>['children']>().toEqualTypeOf<
      (ToRawElement<FooSchema> | ToRawElement<BarSchema>)[]
    >();
  });

  it('FooSchema[] | BarSchema[] -> ToRawElement<Foo>[] | ToRawElement<Bar>[]', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: FooSchema[] | BarSchema[];
    }

    expectTypeOf<ToRawElement<ParentSchema>['children']>().toEqualTypeOf<
      ToRawElement<FooSchema>[] | ToRawElement<BarSchema>[]
    >();
  });

  it('(FooSchema | BarSchema)[] | undefined -> (ToRawElement<Foo> | ToRawElement<Bar>)[] | undefined', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: (FooSchema | BarSchema)[] | undefined;
    }

    expectTypeOf<ToRawElement<ParentSchema>['children']>().toEqualTypeOf<
      (ToRawElement<FooSchema> | ToRawElement<BarSchema>)[] | undefined
    >();
  });

  it('FooSchema[] | BarSchema[] | undefined -> ToRawElement<Foo>[] | ToRawElement<Bar>[] | undefined', () => {
    interface ParentSchema extends BlockSchema {
      name: 'parent';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: FooSchema[] | BarSchema[] | undefined;
    }

    expectTypeOf<ToRawElement<ParentSchema>['children']>().toEqualTypeOf<
      ToRawElement<FooSchema>[] | ToRawElement<BarSchema>[] | undefined
    >();
  });
});

describe('Storage key transformation', () => {
  it('Storage: undefined -> storageKey: undefined', () => {
    interface NoStorageSchema extends BlockSchema {
      name: 'noStorage';
      linkable: false;
      Data: undefined;
      Storage: undefined;
      Children: undefined;
    }

    expectTypeOf<
      ToRawElement<NoStorageSchema>['storageKey']
    >().toEqualTypeOf<undefined>();
  });

  it('Storage: value -> storageKey: string', () => {
    interface WithStorageSchema extends BlockSchema {
      name: 'withStorage';
      linkable: false;
      Data: undefined;
      Storage: string;
      Children: undefined;
    }

    expectTypeOf<
      ToRawElement<WithStorageSchema>['storageKey']
    >().toEqualTypeOf<string>();
  });

  it('Storage: any (base Schema) -> storageKey: string | undefined', () => {
    expectTypeOf<RawElement['storageKey']>().toEqualTypeOf<
      string | undefined
    >();
  });
});
