import type {
  BlockSchema,
  InlinerSchema,
  LinkableSchema,
  Schema,
  SchemaLinkable,
} from './schema.js';

//
// Raw Element
//

export const RAW_ELEMENT_PREFIX = '__TSPROSE_rawElement';

export type ToRawElement<
  TSchema extends Schema,
  TagName extends string = string,
> = TSchema extends Schema
  ? {
      [RAW_ELEMENT_PREFIX]: true;
      schema: TSchema;
      hash: string;
      tagName?: TagName;
      slug?: string;
      uniqueName?: string;
      data: TSchema['Data'];
      storageKey: TSchema['Storage'] extends undefined ? undefined : string;
      children: ToRawElementChildren<TSchema['Children']>;
    }
  : never;

type ToRawElementChildren<TChildren> = TChildren extends undefined
  ? undefined
  : TChildren extends readonly Schema[]
    ? {
        [K in keyof TChildren]: TChildren[K] extends Schema
          ? ToRawElement<TChildren[K]>
          : TChildren[K];
      }
    : never;

export type RawElement = ToRawElement<Schema>;
export type BlockRawElement = ToRawElement<BlockSchema>;
export type InlinerRawElement = ToRawElement<InlinerSchema>;
export type LinkableRawElement = ToRawElement<LinkableSchema>;

//
// Prose Element
//

export const PROSE_ELEMENT_PREFIX = '__TSPROSE_proseElement';

export type ToProseElement<TSchema extends Schema> = {
  [PROSE_ELEMENT_PREFIX]: true;
  schema: TSchema;
  id: false extends TSchema['linkable']
    ? TSchema['linkable'] extends false
      ? undefined
      : string | undefined
    : string;
  data: TSchema['Data'];
  storageKey: false extends TSchema['Storage']
    ? TSchema['linkable'] extends false
      ? undefined
      : undefined | string
    : string;
  children: ToProseElementChildren<TSchema['Children']>;
};

type ToProseElementChildren<TChildren> = TChildren extends undefined
  ? undefined
  : TChildren extends readonly Schema[]
    ? {
        [K in keyof TChildren]: TChildren[K] extends Schema
          ? ToProseElement<TChildren[K]>
          : TChildren[K];
      }
    : never;

export type ProseElement = ToProseElement<Schema>;
export type BlockProseElement = ToProseElement<BlockSchema>;
export type InlinerProseElement = ToProseElement<InlinerSchema>;
export type LinkableProseElement = ToProseElement<LinkableSchema>;
