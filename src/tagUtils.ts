import type { NormalizedChildren } from './children.js';
import { TSProseError } from './error.js';
import type {
  BlockRawElement,
  InlinerRawElement,
  ToRawElement,
} from './element.js';
import { ensureRawElement } from './elementUtils.js';
import type { Schema } from './schema.js';

export function createTagError(tagName: string, message: string) {
  return new TSProseError(`<${tagName}> error!\n${message}`);
}

export function ensureTagNoChildren(
  tagName: string,
  children: NormalizedChildren,
): asserts children is undefined {
  if (children) {
    throw createTagError(tagName, 'This tag cannot have children!');
  }
}

export function ensureTagSingleChild<
  TSchema extends Schema,
  TagName extends string,
>(
  tagName: TagName,
  children: NormalizedChildren,
  schema?: TSchema,
): asserts children is [ToRawElement<TSchema, TagName>] {
  if (!children || children.length !== 1) {
    throw createTagError(
      tagName,
      'This tag requires exactly one child element!',
    );
  }

  const child = children[0];
  ensureRawElement(child, schema);
}

export function ensureTagSingleBlockChild(
  tagName: string,
  children: NormalizedChildren,
): asserts children is [BlockRawElement] {
  ensureTagSingleChild(tagName, children);
  if (children[0].schema.type !== 'block') {
    throw createTagError(
      tagName,
      `This tag requires exactly one block child element but received "${children[0].schema.name}"!`,
    );
  }
}

export function ensureTagSingleInlinerChild(
  tagName: string,
  children: NormalizedChildren,
): asserts children is [InlinerRawElement] {
  ensureTagSingleChild(tagName, children);
  if (children[0].schema.type !== 'inliner') {
    throw createTagError(
      tagName,
      `This tag requires exactly one inliner child element but received "${children[0].schema.name}"!`,
    );
  }
}

export function ensureTagChildren<
  TagName extends string,
  Schemas extends Schema | Schema[],
>(
  tagName: TagName,
  children: NormalizedChildren,
  schemas?: Schemas,
): asserts children is (Schemas extends Schema[]
  ? ToRawElement<Schemas[number], TagName>
  : Schemas extends Schema
    ? ToRawElement<Schemas, TagName>
    : never)[] {
  if (!children) {
    throw createTagError(tagName, 'This tag requires child elements!');
  }

  if (schemas) {
    const validSchemas = new Set<string>(
      schemas
        ? Array.isArray(schemas)
          ? schemas.map((s) => s.name)
          : [schemas.name]
        : undefined,
    );

    for (const child of children) {
      if (!validSchemas.has(child.schema.name)) {
        throw createTagError(
          tagName,
          `This tag cannot have "${child.schema.name}" child!`,
        );
      }
    }
  }
}

export function ensureTagBlockChildren(
  tagName: string,
  children: NormalizedChildren,
): asserts children is BlockRawElement[] {
  ensureTagChildren(tagName, children);
  for (const child of children) {
    if (child.schema.type !== 'block') {
      throw createTagError(
        tagName,
        `This tag cannot have "${child.schema.name}" inliner child!`,
      );
    }
  }
}

export function ensureTagInlinerChildren(
  tagName: string,
  children: NormalizedChildren,
): asserts children is InlinerRawElement[] {
  ensureTagChildren(tagName, children);
  for (const child of children) {
    if (child.schema.type !== 'inliner') {
      throw createTagError(
        tagName,
        `This tag cannot have "${child.schema.name}" block child!`,
      );
    }
  }
}
