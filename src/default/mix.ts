import { defineSchema, type Schema } from '../schema.js';

export interface MixSchema extends Schema {
  name: 'mix';
  type: 'block';
  linkable: false;
  Data: undefined;
  Storage: undefined;
  Children: Schema[];
}

export const mixSchema = defineSchema<MixSchema>({
  name: 'mix',
  type: 'block',
  linkable: false,
});
