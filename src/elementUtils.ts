import {
  PROSE_ELEMENT_PREFIX,
  RAW_ELEMENT_PREFIX,
  type BlockProseElement,
  type BlockRawElement,
  type InlinerProseElement,
  type InlinerRawElement,
  type ToProseElement,
  type ToRawElement,
} from './element.js';
import { TSProseError } from './error.js';
import type { Schema, SchemaType } from './schema.js';
import { hash } from './utils/hash.js';

export function makeRawElement<
  TSchema extends Schema,
  ElementHandler extends (element: ToRawElement<TSchema, TagName>) => void,
  TagName extends string,
>(parameters: {
  schema: TSchema;
  tagName?: TagName;
  elementHandler?: ElementHandler;
}) {
  const element = {
    [RAW_ELEMENT_PREFIX]: true,
    schema: parameters.schema,
    tagName: parameters.tagName,
  } as ToRawElement<TSchema, TagName>;

  parameters.elementHandler?.(element as any);

  if (Array.isArray(element.children) && element.children.length === 0) {
    delete (element as any).children;
  }

  element.hash = hash(
    element.schema.name +
      JSON.stringify(element.data) +
      JSON.stringify(element.children?.map((child) => child.hash).join()),
    12,
  );

  return element as ToRawElement<TSchema, TagName>;
}

export function makeProseElement<
  TSchema extends Schema,
  ElementHandler extends (element: ToProseElement<TSchema>) => void,
>(parameters: { schema: TSchema; elementHandler?: ElementHandler }) {
  const element = {
    [PROSE_ELEMENT_PREFIX]: true,
    schema: parameters.schema,
  } as ToProseElement<TSchema>;

  parameters.elementHandler?.(element as any);

  if (Array.isArray(element.children) && element.children.length === 0) {
    delete (element as any).children;
  }

  return element as ToProseElement<TSchema>;
}

export function isRawElement<TSchema extends Schema>(
  element: any,
  schema?: TSchema,
): element is ToRawElement<TSchema> {
  return isElement(RAW_ELEMENT_PREFIX, element, schema);
}
export function isProseElement<TSchema extends Schema>(
  element: any,
  schema?: TSchema,
): element is ToProseElement<TSchema> {
  return isElement(PROSE_ELEMENT_PREFIX, element, schema);
}
function isElement(prefix: string, element: any, schema?: Schema) {
  if (element?.[prefix] === true) {
    if (schema) {
      return schema.name === element?.schema?.name;
    }
    return true;
  }
  return false;
}

export function ensureRawElement<TSchema extends Schema>(
  element: any,
  schema?: TSchema,
): asserts element is ToRawElement<TSchema> {
  ensureElement(RAW_ELEMENT_PREFIX, element, schema);
}
export function ensureProseElement<TSchema extends Schema>(
  element: any,
  schema?: TSchema,
): asserts element is ToProseElement<TSchema> {
  ensureElement(PROSE_ELEMENT_PREFIX, element, schema);
}
function ensureElement(prefix: string, element: any, schema?: Schema) {
  if (!isElement(prefix, element, schema)) {
    throw new TSProseError(
      `Not a ${prefix === RAW_ELEMENT_PREFIX ? 'RawElement' : 'ProseElement'}${schema ? ` with "${schema.name}" schema` : ''}!\nProvided:${JSON.stringify(element)}`,
    );
  }
}

export function isRawBlock(element: any): element is BlockRawElement {
  return isType('raw', 'block', element);
}
export function isRawInliner(element: any): element is InlinerRawElement {
  return isType('raw', 'inliner', element);
}
export function isProseBlock(element: any): element is BlockProseElement {
  return isType('prose', 'block', element);
}
export function isProseInliner(element: any): element is InlinerProseElement {
  return isType('prose', 'inliner', element);
}
function isType(elementType: 'raw' | 'prose', type: SchemaType, element: any) {
  if (elementType === 'raw' ? isRawElement(element) : isProseElement(element)) {
    return element.schema.type === type;
  }
  return false;
}

export function ensureRawBlock(
  element: any,
): asserts element is BlockRawElement {
  ensureType('raw', 'block', element);
}
export function ensureRawInliner(
  element: any,
): asserts element is InlinerRawElement {
  ensureType('raw', 'inliner', element);
}
export function ensureProseBlock(
  element: any,
): asserts element is BlockProseElement {
  ensureType('prose', 'block', element);
}
export function ensureProseInliner(
  element: any,
): asserts element is InlinerProseElement {
  ensureType('prose', 'inliner', element);
}
function ensureType(
  elementType: 'raw' | 'prose',
  type: SchemaType,
  element: any,
) {
  if (!isType(elementType, type, element)) {
    throw new TSProseError(
      `Not a ${elementType} ${type}!\nProvided:${JSON.stringify(element)}`,
    );
  }
}

export function hasChildren<T>(element: {
  children?: T[];
}): element is { children: [T, ...T[]] } {
  return element.children !== undefined && element.children.length > 0;
}
export function ensureChildren<T>(element: {
  children?: T[];
}): asserts element is { children: [T, ...T[]] } {
  if (!hasChildren(element)) {
    throw new TSProseError('Provided element has no children!');
  }
}
