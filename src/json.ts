import { PROSE_ELEMENT_PREFIX, RAW_ELEMENT_PREFIX } from './element.js';
import { SCHEMA_PREFIX, type RuntimeSchema, type Schema } from './schema.js';

function encodeSchema(schema: Schema): string {
  return (
    schema.name +
    (schema.type === 'block' ? '0' : '1') +
    (schema.linkable === false ? '0' : schema.linkable === 'always' ? '2' : '1')
  );
}

function decodeSchema(encoded: string): RuntimeSchema<Schema> {
  const name = encoded.slice(0, -2);
  const typeFlag = encoded.at(-2);
  const linkFlag = encoded.at(-1);

  return {
    [SCHEMA_PREFIX]: true,
    name,
    type: typeFlag === '0' ? 'block' : 'inliner',
    linkable: linkFlag === '0' ? false : linkFlag === '2' ? 'always' : true,
  };
}

function isElement(obj: Record<string, unknown>): boolean {
  return obj[RAW_ELEMENT_PREFIX] === true || obj[PROSE_ELEMENT_PREFIX] === true;
}

export function toJSON(value: unknown, indent?: number): string {
  return JSON.stringify(
    value,
    function (key, val) {
      if (!isElement(this)) return val;

      if (key === RAW_ELEMENT_PREFIX || key === PROSE_ELEMENT_PREFIX) {
        const schema = (this as any).schema as Schema;
        return encodeSchema(schema);
      }

      if (key === 'schema') {
        return undefined;
      }

      return val;
    },
    indent,
  );
}

export function fromJSON(json: string) {
  return JSON.parse(json, function (key, val) {
    if (
      (key === RAW_ELEMENT_PREFIX || key === PROSE_ELEMENT_PREFIX) &&
      typeof val === 'string'
    ) {
      const schema = decodeSchema(val);
      (this as any).schema = schema;
      return true;
    }

    return val;
  });
}
