import { defineSchema, type Schema } from '../schema.js';

export interface TextSchema extends Schema {
  name: 'text';
  type: 'inliner';
  linkable: false;
  Data: string;
  Storage: undefined;
  Children: undefined;
}

export const textSchema = defineSchema<TextSchema>({
  name: 'text',
  type: 'inliner',
  linkable: false,
});
