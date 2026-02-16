import { describe, expect, it } from 'vitest';

import type { ToRawElement } from '@src/element';
import {
  defineSchema,
  type BlockSchema,
  type InlinerSchema,
} from '@src/schema';
import { defineTag } from '@src/tag';
import {
  createTagError,
  ensureTagChildren,
  ensureTagInlinerChildren,
  ensureTagNoChildren,
} from '@src/tagUtils';
import { isRawElement } from '@src/elementUtils';
import { type TextSchema, textSchema } from '@src/default/text';
import { defineAutoUnique, defineUnique } from '@src/unique';
import type { ElementStorageCreator } from '@src/storage';

//
// Paragraph
//

export interface ParagraphSchema extends BlockSchema {
  name: 'paragraph';
  type: 'block';
  linkable: true;
  Data: { serif?: boolean; center?: boolean } | undefined;
  Storage: undefined;
  Children: InlinerSchema[];
}

export const paragraphSchema = defineSchema<ParagraphSchema>({
  name: 'paragraph',
  type: 'block',
  linkable: true,
});

export type ParagraphRawElement = ToRawElement<typeof paragraphSchema>;

export const P = defineTag({
  tagName: 'P',
  schema: paragraphSchema,
})<{ serif?: true; center?: true }>(({ tagName, props, children, element }) => {
  ensureTagInlinerChildren(tagName, children);
  element.children = children;

  if (props.serif) {
    element.data ||= {};
    element.data.serif = true;
  }

  if (props.center) {
    element.data ||= {};
    element.data.center = true;
  }
});

//
// QED
//

export interface QedSchema extends BlockSchema {
  name: 'qed';
  type: 'block';
  linkable: false;
  Data: undefined;
  Storage: undefined;
  Children: undefined;
}

export const qedSchema = defineSchema<QedSchema>({
  name: 'qed',
  type: 'block',
  linkable: false,
});

export type QedRawElement = ToRawElement<typeof qedSchema>;

export const QED = defineTag({
  tagName: 'QED',
  schema: qedSchema,
})(({ tagName, children }) => {
  ensureTagNoChildren(tagName, children);
});

//
// Details
//

export interface DetailsSchema extends BlockSchema {
  name: 'details';
  type: 'block';
  linkable: 'always';
  Data: { title: string };
  Storage: undefined;
  Children: (ParagraphSchema | QedSchema)[];
}

export const detailsSchema = defineSchema<DetailsSchema>({
  name: 'details',
  type: 'block',
  linkable: 'always',
});

export type DetailsRawElement = ToRawElement<typeof detailsSchema>;

export const Details = defineTag({
  tagName: 'Details',
  schema: detailsSchema,
})<{ title: string }>(({ tagName, props, children, element }) => {
  ensureTagChildren(tagName, children, [paragraphSchema, qedSchema]);
  element.children = children;
  element.data = { title: props.title };
});

//
// Bold
//

export interface BoldSchema extends InlinerSchema {
  name: 'bold';
  type: 'inliner';
  linkable: true;
  Data: undefined;
  Storage: string;
  Children: TextSchema[];
}

export const boldSchema = defineSchema<BoldSchema>({
  name: 'bold',
  type: 'inliner',
  linkable: true,
});

export type BoldRawElement = ToRawElement<typeof boldSchema>;

export const B = defineTag({
  tagName: 'B',
  schema: boldSchema,
})<{ storageKey?: string }>(({ tagName, props, children, element }) => {
  ensureTagChildren(tagName, children, textSchema);
  element.children = children;
  if (props.storageKey) {
    element.storageKey = props.storageKey;
  }
});

export const boldStorageCreator: ElementStorageCreator<typeof boldSchema> = (
  element,
) => {
  const text = element.children?.map((c) => c.data).join('') ?? '';
  return `bold:${text}`;
};

//
// Image
//

export interface ImageSchema extends BlockSchema {
  name: 'image';
  type: 'block';
  linkable: true;
  Data: { src: string };
  Storage: { width: number; height: number } | undefined;
  Children: undefined;
}

export const imageSchema = defineSchema<ImageSchema>({
  name: 'image',
  type: 'block',
  linkable: true,
});

export type ImageRawElement = ToRawElement<typeof imageSchema>;

export const Image = defineTag({
  tagName: 'Image',
  schema: imageSchema,
})<{ src: string }>(({ tagName, props, children, element }) => {
  ensureTagNoChildren(tagName, children);
  element.data = { src: props.src };
  element.storageKey = `image-${props.src}`;
  element.slug = 'image-slug-' + props.src;
});

export const imageStorageCreator: ElementStorageCreator<
  typeof imageSchema
> = async (element) => {
  const { src } = element.data;
  await new Promise((resolve) => setTimeout(resolve, 100));
  return src === 'image-none' ? undefined : { width: 200, height: 100 };
};

//
// Tests
//

describe('Paragraph', () => {
  it('should throw when no children or they are not inliners', () => {
    expect(() => (
      <P>
        <P>Nested</P>
      </P>
    )).toThrow();

    // @ts-expect-error Paragraph expects children
    expect(() => <P></P>).toThrow();
  });

  it('should create element with correct data and children', () => {
    const paragraphElement = (
      <P serif>I am number {1}!</P>
    ) as ParagraphRawElement;

    expect(isRawElement(paragraphElement, paragraphSchema)).toBe(true);
    expect(paragraphElement.data).toEqual({ serif: true });
    const [textChild] = paragraphElement.children;
    expect(isRawElement(textChild, textSchema)).toBe(true);
    expect(textChild.data).toBe('I am number 1!');
  });

  it('should accept only P unique or auto unique', () => {
    const pUnique = defineUnique({
      documentId: 'doc1',
      name: 'pUnique',
      tag: P,
    });

    expect(() => pUnique.rawElement).toThrow();
    expect(pUnique.tag).toEqual(P);
    const pElement = (
      <P $={pUnique}>Uniqued Paragraph</P>
    ) as ParagraphRawElement;
    expect(pUnique.rawElement).toEqual(pElement);

    const detailsUnique = defineUnique({
      documentId: 'doc1',
      name: 'detailsUnique',
      tag: Details,
    });

    expect(() => (
      /* @ts-expect-error Details unique cannot be used with P tag */
      <P $={detailsUnique}>Throwing Paragraph</P>
    )).toThrow();

    const autoUnique = defineAutoUnique({
      documentId: 'doc1',
      name: 'autoUnique',
    });

    expect(() => autoUnique.rawElement).toThrow();
    expect(() => autoUnique.tag).toThrow();
    const autoPElement = (
      <P $={autoUnique}>Auto Uniqued Paragraph</P>
    ) as ParagraphRawElement;
    expect(autoUnique.rawElement).toEqual(autoPElement);
    expect(autoUnique.tag).toEqual(P);
  });
});

describe('QED', () => {
  it('should throw when has children', () => {
    expect(() => (
      <QED>
        {/* @ts-expect-error QED does not accept children */}
        <P>Nested</P>
      </QED>
    )).toThrow();
  });

  it('should not allow any props', () => {
    // @ts-expect-error QED does not accept any props
    <QED foo="foo" />;
  });

  it('should create QED element', () => {
    const qedElement = (<QED />) as QedRawElement;
    expect(isRawElement(qedElement, qedSchema)).toBe(true);
    expect(qedElement.data).toBeUndefined();
    expect(qedElement.children).toBeUndefined();
    expect(qedElement.storageKey).toBeUndefined();
  });
});

describe('Details', () => {
  it('should throw when no unique provided', () => {
    expect(() => (
      // @ts-expect-error Details requires unique
      <Details title="Title">
        <P>This is details paragraph!</P>
      </Details>
    )).toThrow();
  });
});

it('should not allow block children in inliner', () => {
  expect(() => (
    <B>
      <P>Wrong</P>
    </B>
  )).toThrow();
});

//
// Recursive
//

interface RecursiveSchema extends BlockSchema {
  name: 'recursive';
  type: 'block';
  linkable: true;
  Data: { level: number };
  Storage: undefined;
  Children: RecursiveSchema[] | undefined;
}

const recursiveSchema = defineSchema<RecursiveSchema>({
  name: 'recursive',
  type: 'block',
  linkable: true,
});

const R = defineTag({
  tagName: 'R',
  schema: recursiveSchema,
})(({ tagName, children, element }) => {
  if (children) {
    ensureTagChildren(tagName, children, recursiveSchema);
    element.children = children;

    const maxChildLevel = children.reduce((max, child) => {
      const childLevel = child.data.level;
      return childLevel > max ? childLevel : max;
    }, 0);

    if (maxChildLevel > 5) {
      throw createTagError(
        tagName,
        `Maximum recursion level exceeded: ${maxChildLevel}`,
      );
    }

    element.data = { level: maxChildLevel + 1 };
  } else {
    element.data = { level: 1 };
  }
});

describe('Recursive', () => {
  it('should allow recursive children', () => {
    const recursiveElement = (
      <R>
        <R>
          <R />
        </R>
      </R>
    ) as ToRawElement<typeof recursiveSchema>;

    expect(isRawElement(recursiveElement, recursiveSchema)).toBe(true);
    const [child1] = recursiveElement.children ?? [];
    expect(isRawElement(child1, recursiveSchema)).toBe(true);
    const [child2] = child1.children ?? [];
    expect(isRawElement(child2, recursiveSchema)).toBe(true);
  });

  it('should throw when recursion level exceeds limit', () => {
    expect(() => (
      <R>
        <R>
          <R>
            <R>
              <R>
                <R>
                  <R />
                </R>
              </R>
            </R>
          </R>
        </R>
      </R>
    )).toThrow();
  });
});
