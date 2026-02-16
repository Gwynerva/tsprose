import { normalizeChildren, type NormalizedChildren } from './children.js';
import type { ToRawElement } from './element.js';
import { makeRawElement } from './elementUtils.js';
import { TSProseError } from './error.js';
import type { LinkableSchema, Schema } from './schema.js';
import { isAutoUnique, type AutoUnique, type ToUnique } from './unique.js';

export const TAG_PREFIX = '__TSPROSE_tag';

export type ToTag<
  TSchema extends Schema,
  TagName extends string,
  Props extends Record<string, any>,
> = {
  [TAG_PREFIX]: true;
  tagName: TagName;
  schema: TSchema;
} & ((
  props: TagProps<TSchema, TagName, Props>,
) => ToRawElement<TSchema, TagName>);

export type Tag = ToTag<Schema, string, any>;
export type LinkableTag = ToTag<LinkableSchema, string, any>;

export type TagProps<
  TSchema extends Schema,
  TagName extends string,
  Props extends Record<string, any> = {},
> = TagChildren<TSchema, Props> & TagLinkable<TSchema, TagName> & Props;

export type TagChildren<
  TSchema extends Schema,
  Props,
> = 'children' extends keyof Props
  ? {}
  : [TSchema['Children']] extends [undefined]
    ? { children?: never }
    : undefined extends TSchema['Children']
      ? { children?: {} }
      : { children: {} };

export type TagLinkable<
  TSchema extends Schema,
  TagName extends string,
> = TSchema extends LinkableSchema
  ? TSchema['linkable'] extends 'always'
    ? {
        $: ToUnique<ToTag<TSchema, TagName, any>> | AutoUnique;
      }
    : TSchema['linkable'] extends true
      ? {
          $?: ToUnique<ToTag<TSchema, TagName, any>> | AutoUnique;
        }
      : {}
  : {};

export type ValidateTagCustomProps<Props extends Record<string, any> = {}> =
  Extract<keyof Props, '$'> extends infer Conflict
    ? [Conflict] extends [never]
      ? Props
      : `Forbidden custom tag property '${Extract<
          Conflict,
          string | number | bigint
        >}'!`
    : never;

export type NoChildren = { children?: never };
export type OptionalChildren = { children?: {} };
export type RequiredChildren = { children: {} };

export function defineTag<
  TSchema extends Schema,
  TagName extends string,
>(tagParameters: { tagName: TagName; schema: TSchema }) {
  const tagName = tagParameters.tagName;
  if (!tagName.trim()) {
    throw new TSProseError(`Invalid tag name "${tagName}"!`);
  }

  function finalizeTag<const Props extends ValidateTagCustomProps<Props>>(
    tagElementHandler: TagElementHandler<TagName, TSchema, Props>,
  ) {
    const tag = (props: any) => {
      const { tagName, schema } = tagParameters;
      const children = normalizeChildren(props.children, (child) => {
        if (schema.type === 'inliner' && child.schema.type === 'block') {
          throw new TSProseError(
            `Inliner <${tagName}> cannot have block children! Detected block child "${child.schema.name}"!`,
          );
        }
      });

      const rawElement = makeRawElement({
        tagName,
        schema,
        elementHandler: (element) => {
          if (props.$) {
            element.uniqueName = props.$.name;
            props.$.rawElement = element;
            if (isAutoUnique(props.$)) {
              props.$.tag = tag;
            }
          } else {
            if (schema.linkable === 'always') {
              throw new TSProseError(
                `Tag <${tagName}> requires a unique provided via "$" prop!`,
              );
            }
          }

          tagElementHandler({
            tagName,
            props,
            children,
            element,
          });
        },
      });

      return rawElement;
    };

    Object.defineProperties(tag, {
      [TAG_PREFIX]: { value: true },
      tagName: { value: tagName },
      schema: { value: tagParameters.schema },
    });

    return tag as ToTag<TSchema, TagName, Props>;
  }

  return finalizeTag;
}

export type TagElementHandler<
  TagName extends string,
  TSchema extends Schema,
  Props extends Record<string, any>,
> = (context: {
  tagName: TagName;
  props: TagProps<TSchema, TagName, Props>;
  children: NormalizedChildren;
  element: ToRawElement<TSchema, TagName>;
}) => void;
