import { describe, expectTypeOf, it } from 'vitest';

import { defineSchema, type Schema, type SchemaLinkable } from '@src/schema';
import { type TextSchema, textSchema } from '@src/default/text';
import type { ToRawElement } from '@src/element';
import {
  type TagChildren,
  type ValidateTagCustomProps,
  type TagLinkable,
  type TagProps,
  type NoChildren,
  type OptionalChildren,
  type RequiredChildren,
  type ToTag,
  type Tag,
  type LinkableTag,
  defineTag,
} from '@src/tag';
import type { NormalizedChildren } from '@src/children';
import type { ToUnique, AutoUnique } from '@src/unique';

//
// Test helper schemas
//

interface _TestSchema<
  Linkable extends SchemaLinkable,
  Children extends Schema[] | undefined,
> extends Schema {
  name: string;
  type: 'block';
  linkable: Linkable;
  Data: any;
  Storage: any;
  Children: Children;
}

type _ResolveChildren<ChildrenType extends string> =
  ChildrenType extends 'undefined'
    ? undefined
    : ChildrenType extends 'optional'
      ? TextSchema[] | undefined
      : TextSchema[];

function $schema<
  Linkable extends SchemaLinkable,
  ChildrenType extends 'undefined' | 'optional' | 'required',
>(linkable: Linkable, childrenType: ChildrenType) {
  return defineSchema<_TestSchema<Linkable, _ResolveChildren<ChildrenType>>>({
    name: `${childrenType}Children`,
    type: 'block',
    linkable,
  });
}

//
// Tests
//

describe('TagChildren', () => {
  it('should correctly create children prop for tags', () => {
    const noChildrenSchema = $schema(false, 'undefined');
    type NoTagChildren = TagChildren<typeof noChildrenSchema, {}>;
    expectTypeOf<NoTagChildren>().toEqualTypeOf<{
      children?: never;
    }>();

    const optionalChildrenSchema = $schema(false, 'optional');
    type OptionalTagChildren = TagChildren<typeof optionalChildrenSchema, {}>;
    expectTypeOf<OptionalTagChildren>().toEqualTypeOf<{
      children?: {};
    }>();

    const requiredChildrenSchema = $schema(false, 'required');
    type RequiredTagChildren = TagChildren<typeof requiredChildrenSchema, {}>;
    expectTypeOf<RequiredTagChildren>().toEqualTypeOf<{
      children: {};
    }>();
  });
});

describe('TagLinkable', () => {
  interface _LinkableTestSchema<
    Linkable extends SchemaLinkable,
  > extends Schema {
    name: string;
    type: 'block';
    linkable: Linkable;
    Data: any;
    Storage: any;
    Children: undefined;
  }

  function linkableSchema<Linkable extends SchemaLinkable>(linkable: Linkable) {
    return defineSchema<_LinkableTestSchema<Linkable>>({
      name: `${linkable}Linkable`,
      type: 'block',
      linkable,
    });
  }

  const noneLinkableSchema = linkableSchema(false);
  const optionalLinkableSchema = linkableSchema(true);
  const alwaysLinkableSchema = linkableSchema('always');

  it('should correctly create linkable prop for tags', () => {
    type NotTagLinkable = TagLinkable<typeof noneLinkableSchema, string>;
    expectTypeOf<NotTagLinkable>().toEqualTypeOf<{}>();

    type OptionalTagLinkable = TagLinkable<
      typeof optionalLinkableSchema,
      string
    >;
    expectTypeOf<OptionalTagLinkable>().toEqualTypeOf<{
      $?:
        | ToUnique<ToTag<typeof optionalLinkableSchema, string, any>>
        | AutoUnique;
    }>();

    type AlwaysTagLinkable = TagLinkable<typeof alwaysLinkableSchema, string>;
    expectTypeOf<AlwaysTagLinkable>().toEqualTypeOf<{
      $: ToUnique<ToTag<typeof alwaysLinkableSchema, string, any>> | AutoUnique;
    }>();
  });
});

describe('ValidateTagCustomProps', () => {
  it('should not allow "$" as a custom prop name', () => {
    type SingleIntersect = ValidateTagCustomProps<{
      $: number;
      customProp: number;
    }>;
    expectTypeOf<SingleIntersect>().toExtend<string>();

    type ValidCustomProps = ValidateTagCustomProps<{
      customProp: number;
      children: number; // children override is allowed
    }>;
    expectTypeOf<ValidCustomProps>().toEqualTypeOf<{
      customProp: number;
      children: number;
    }>();
  });
});

describe('TagProps', () => {
  it('should correctly add custom props to TagProps', () => {
    const linkableMaybeChildrenSchema = $schema(true, 'optional');
    type CustomTagProps = TagProps<
      typeof linkableMaybeChildrenSchema,
      string,
      { customProp: number }
    >;
    expectTypeOf<keyof CustomTagProps>().toEqualTypeOf<
      'children' | '$' | 'customProp'
    >();
  });

  it('should allow manual children override via NoChildren, OptionalChildren, RequiredChildren', () => {
    const requiredChildrenSchema = $schema(false, 'undefined');
    type OverrideToNo = TagProps<
      typeof requiredChildrenSchema,
      string,
      NoChildren & { customProp: number }
    >;
    expectTypeOf<OverrideToNo>().toEqualTypeOf<
      { children?: never } & { customProp: number }
    >();

    const noChildrenSchema = $schema(false, 'undefined');
    type OverrideToOptional = TagProps<
      typeof noChildrenSchema,
      string,
      OptionalChildren & { customProp: number }
    >;
    expectTypeOf<OverrideToOptional>().toEqualTypeOf<
      { children?: {} } & { customProp: number }
    >();

    type OverrideToRequired = TagProps<
      typeof noChildrenSchema,
      string,
      RequiredChildren & { customProp: number }
    >;
    expectTypeOf<OverrideToRequired>().toEqualTypeOf<
      { children: {} } & { customProp: number }
    >();
  });
});

describe('defineTag', () => {
  it('should handle forbidden custom prop names', () => {
    const finalizeTag = defineTag({
      tagName: 'Tag',
      schema: $schema(true, 'optional'),
    });

    finalizeTag<// @ts-expect-error $ is a forbidden custom prop name
    {
      $: number;
      foo: string;
    }>(() => {});

    // This should be fine
    finalizeTag<
      {
        foo: string;
      } & OptionalChildren
    >(() => {});
  });

  it('should infer all needed types for tag correctly', () => {
    const schema1 = $schema('always', 'required');
    const tag1 = defineTag({
      tagName: 'TestTag1',
      schema: schema1,
    })<{
      level: 1 | 2 | 3;
    }>(() => {});
    expectTypeOf<typeof tag1>().toEqualTypeOf<
      ToTag<
        typeof schema1,
        'TestTag1',
        {
          level: 1 | 2 | 3;
        }
      >
    >();

    type _TagProps1 = Parameters<typeof tag1>[0];
    expectTypeOf<_TagProps1>().toEqualTypeOf<
      {
        $: ToUnique<ToTag<typeof schema1, 'TestTag1', any>> | AutoUnique;
      } & { children: {} } & {
        level: 1 | 2 | 3;
      }
    >();

    type TagReturn1 = ReturnType<typeof tag1>;
    expectTypeOf<TagReturn1>().toEqualTypeOf<
      ToRawElement<typeof schema1, 'TestTag1'>
    >();

    const schema2 = $schema(false, 'undefined');
    const tag2 = defineTag({
      tagName: 'TestTag2',
      schema: schema2,
    })(() => {});
    expectTypeOf<typeof tag2>().toEqualTypeOf<
      ToTag<typeof schema2, 'TestTag2', {}>
    >();

    type _TagProps2 = Parameters<typeof tag2>[0];
    expectTypeOf<_TagProps2>().toEqualTypeOf<{ children?: never }>();

    type TagReturn2 = ReturnType<typeof tag2>;
    expectTypeOf<TagReturn2>().toEqualTypeOf<
      ToRawElement<typeof schema2, 'TestTag2'>
    >();
  });

  it('should widen correctly', () => {
    const specificTag1 = defineTag({
      tagName: 'SpecificTag1',
      schema: $schema(true, 'required'),
    })<{
      level: 1 | 2 | 3;
    }>(() => {});
    expectTypeOf<typeof specificTag1>().toExtend<Tag>();

    const specificTag2 = defineTag({
      tagName: 'SpecificTag2',
      schema: $schema('always', 'undefined'),
    })<{
      level: 1 | 2 | 3;
    }>(() => {});
    expectTypeOf<typeof specificTag2>().toExtend<Tag>();

    const specificTag3 = defineTag({
      tagName: 'SpecificTag3',
      schema: $schema(false, 'optional'),
    })(() => {});
    expectTypeOf<typeof specificTag3>().toExtend<Tag>();
  });

  it('should accept uniques with matching tag names', () => {});

  it('should accept auto uniques', () => {});
});

describe('LinkableTag', () => {
  it('should correctly widen', () => {
    const specificLinkableTag = defineTag({
      tagName: 'SpecificLinkableTag',
      schema: $schema(true, 'required'),
    })<{
      level: 1 | 2 | 3;
    }>(() => {});
    expectTypeOf<typeof specificLinkableTag>().toExtend<LinkableTag>();
    expectTypeOf<typeof specificLinkableTag>().toExtend<Tag>();

    const nonLinkableTag = defineTag({
      tagName: 'NonLinkableTag',
      schema: $schema(false, 'required'),
    })<{
      level: 1 | 2 | 3;
    }>(() => {});
    expectTypeOf<typeof nonLinkableTag>().not.toExtend<LinkableTag>();
  });
});

describe('TagElementHandler', () => {
  it('should infer correct types for parameters', () => {
    const schema = $schema(true, 'required');
    const tag = defineTag({
      tagName: 'TestTag',
      schema,
    })<{
      level: 1 | 2 | 3;
    }>(({ tagName, props, children, element }) => {
      expectTypeOf<typeof tagName>().toEqualTypeOf<'TestTag'>();
      expectTypeOf<typeof props>().toEqualTypeOf<
        {
          $?: ToUnique<ToTag<typeof schema, 'TestTag', any>> | AutoUnique;
        } & { children: {} } & {
          level: 1 | 2 | 3;
        }
      >();
      expectTypeOf<typeof children>().toEqualTypeOf<NormalizedChildren>();
      expectTypeOf<typeof element>().toEqualTypeOf<
        ToRawElement<typeof schema, 'TestTag'>
      >();
    });
  });
});
