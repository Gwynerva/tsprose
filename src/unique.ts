import type { ToRawElement } from './element.js';
import { TSProseError } from './error.js';
import type { LinkableTag } from './tag.js';

export const UNIQUE_PREFIX = '__TSPROSE_unique';

export interface ToUnique<Tag extends LinkableTag> {
  [UNIQUE_PREFIX]: true;
  documentId: string;
  name: string;
  tag: Tag;
  rawElement: ToRawElement<Tag['schema'], Tag['tagName']>;
}

export type Unique = ToUnique<LinkableTag>;

export interface AutoUnique extends Unique {
  auto: true;
}

export function defineUnique<Tag extends LinkableTag>(uniqueParameters: {
  documentId: string;
  name: string;
  tag: Tag;
}): ToUnique<Tag> {
  const { documentId, name, tag } = uniqueParameters;

  const schema = tag.schema;
  if (!schema.linkable) {
    throw new TSProseError(
      `Unable to create unique "${name}" for <${tag.tagName}> because its schema is not linkable!`,
    );
  }

  let rawElement: ToRawElement<Tag['schema'], Tag['tagName']> | undefined;

  return {
    [UNIQUE_PREFIX]: true,
    documentId,
    name,
    tag,
    get rawElement() {
      if (!rawElement) {
        throw new TSProseError(
          `Unique "${name}" raw element is not assigned yet!`,
        );
      }
      return rawElement;
    },
    set rawElement(value: ToRawElement<Tag['schema'], Tag['tagName']>) {
      if (rawElement) {
        throw new TSProseError(
          `Unique "${name}" raw element is already assigned and cannot be reassigned!`,
        );
      }
      if (value.tagName !== tag.tagName) {
        throw new TSProseError(
          `Unique "${name}" requires <${tag.tagName}> element but received <${value.tagName}>!`,
        );
      }
      rawElement = value;
    },
  };
}

export function defineAutoUnique(uniqueParameters: {
  documentId: string;
  name: string;
}): AutoUnique {
  const { documentId, name } = uniqueParameters;

  let tag: LinkableTag | undefined;
  let rawElement: ToRawElement<any, any> | undefined;

  return {
    [UNIQUE_PREFIX]: true,
    auto: true,
    documentId,
    name,
    get tag() {
      if (!tag) {
        throw new TSProseError(
          `Auto unique "${name}" tag is not assigned yet!`,
        );
      }
      return tag;
    },
    set tag(value: LinkableTag) {
      if (tag) {
        throw new TSProseError(
          `Auto unique "${name}" tag is already assigned and cannot be reassigned!`,
        );
      }
      tag = value;
    },
    get rawElement() {
      if (!rawElement) {
        throw new TSProseError(
          `Auto unique "${name}" raw element is not assigned yet!`,
        );
      }
      return rawElement;
    },
    set rawElement(value: ToRawElement<any, any>) {
      if (rawElement) {
        throw new TSProseError(
          `Auto unique "${name}" raw element is already assigned and cannot be reassigned!`,
        );
      }
      if (!value.schema.linkable) {
        throw new TSProseError(
          `Auto unique "${name}" cannot be assigned with non-linkable <${value.tagName}>!`,
        );
      }
      rawElement = value;
    },
  };
}

export function isUnique<Tag extends LinkableTag>(
  unique: any,
  tag?: Tag,
): unique is ToUnique<Tag> {
  if (unique?.[UNIQUE_PREFIX] === true) {
    if (tag) {
      return unique.tag === tag;
    }
    return true;
  }
  return false;
}

export function isAutoUnique(unique: any): unique is AutoUnique {
  return isUnique(unique) && (unique as AutoUnique).auto === true;
}
