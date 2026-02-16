export const SCHEMA_PREFIX = '__TSPROSE_schema';

export type SchemaName = string;
export type SchemaType = 'block' | 'inliner';
export type SchemaLinkable = boolean | 'always';

export interface Schema {
  [SCHEMA_PREFIX]: true;
  name: SchemaName;
  type: SchemaType;
  linkable: SchemaLinkable;
  Data: any;
  Storage: any;
  Children: Schema[] | undefined;
}

export interface BlockSchema extends Schema {
  type: 'block';
}

export interface InlinerSchema extends Schema {
  type: 'inliner';
  Children: InlinerSchema[] | undefined;
}

export interface LinkableSchema extends Schema {
  linkable: true | 'always';
}

export type RuntimeSchema<T extends Schema> = Omit<
  T,
  'Data' | 'Storage' | 'Children'
>;

export function defineSchema<T extends Schema>(
  runtimeSchema: Omit<RuntimeSchema<T>, typeof SCHEMA_PREFIX>,
) {
  return {
    ...runtimeSchema,
    [SCHEMA_PREFIX]: true,
  } satisfies RuntimeSchema<Schema> as T;
}
