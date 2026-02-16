import type {
  BlockSchema,
  InlinerSchema,
  LinkableSchema,
  Schema,
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

type ToRawElementChildren<TChildren> = TChildren extends (infer E extends
  Schema)[]
  ? ToRawElement<E>[]
  : TChildren extends undefined
    ? undefined
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
  id: TSchema['linkable'] extends false ? undefined : string;
  data: TSchema['Data'];
  storageKey: TSchema['Storage'] extends undefined ? undefined : string;
  children: ToProseElementChildren<TSchema['Children']>;
};

type ToProseElementChildren<TChildren> = TChildren extends (infer E extends
  Schema)[]
  ? ToProseElement<E>[]
  : TChildren extends undefined
    ? undefined
    : never;

export type ProseElement = ToProseElement<Schema>;
export type BlockProseElement = ToProseElement<BlockSchema>;
export type InlinerProseElement = ToProseElement<InlinerSchema>;
export type LinkableProseElement = ToProseElement<LinkableSchema>;
