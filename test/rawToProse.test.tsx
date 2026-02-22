import { describe, expect, it } from 'vitest';

import { defineUnique } from '@src/unique';
import { rawToProse } from '@src/rawToProse';
import { isProseElement } from '@src/elementUtils';
import { mixSchema } from '@src/default/mix';

import { B, Image, imageSchema, P } from './playground.test';

describe('rawToProse', () => {
  it('should convert raw prose to prose collecting ids and uniques, calling hooks', async () => {
    const uniqueHarryP = defineUnique({
      documentId: 'rawToProseTest',
      name: 'uniqueHarryP',
      tag: P,
    });

    const rawProse = (
      <>
        <P $={uniqueHarryP} serif>
          There once was a boy named Harry.
        </P>
        <P>
          He lived in a cupboard <B>under the stairs.</B>
        </P>
        <Image src="cupboard" />
        <Image src="cupboard" />
        <P>
          He had a scar on his forehead that was in the shape of a lightning
          bolt.
        </P>
      </>
    );

    const preSchemas: string[] = [];
    const postSchemas: string[] = [];
    const imageIds: string[] = [];

    const { prose, takenIds, uniques } = await rawToProse({
      rawProse,
      pre: (rawElement) => {
        preSchemas.push(rawElement.schema.name);
      },
      post: (proseElement) => {
        postSchemas.push(proseElement.schema.name);
      },
      step: ({ rawElement, proseElement }) => {
        expect(proseElement.schema.name).toBe(rawElement.schema.name);

        if (isProseElement(proseElement, imageSchema)) {
          imageIds.push(proseElement.id);
        }
      },
    });

    expect(isProseElement(prose, mixSchema)).toBe(true);

    const expectedSchemas = [
      'text',
      'paragraph',
      'text',
      'text',
      'bold',
      'paragraph',
      'image',
      'image',
      'text',
      'paragraph',
      'mix',
    ];
    expect(preSchemas).toEqual(expectedSchemas);
    expect(postSchemas).toEqual(preSchemas);

    expect(imageIds).toEqual(['image-slug-cupboard', 'image-slug-cupboard-1']);
    expect(takenIds.size).toBe(6);
    expect(Object.keys(uniques)).toEqual(['uniqueHarryP']);

    expect(uniques['uniqueHarryP']).toMatchObject({
      id: 'uniqueHarryP',
      data: { serif: true },
      children: [{ data: 'There once was a boy named Harry.' }],
    });
  });

  it('should apply custom slugify only to slug-based ids, not auto-generated ids', async () => {
    const slugify = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // src with uppercase and spaces so the slugify effect is unambiguous
    const rawProse = (
      <>
        <Image src="Cupboard Photo" />
        <P>Hello world</P>
      </>
    );

    const { takenIds } = await rawToProse({
      rawProse,
      slugify,
    });

    const imageEntry = [...takenIds.entries()].find(
      ([, el]) => el.schema.name === 'image',
    )!;
    const paragraphEntry = [...takenIds.entries()].find(
      ([, el]) => el.schema.name === 'paragraph',
    )!;

    // Slug-based ID: slugify IS applied to the element's slug string
    // Image slug = 'image-slug-Cupboard Photo' → slugified = 'image_slug_cupboard_photo'
    expect(imageEntry[0]).toBe(slugify('image-slug-Cupboard Photo'));
    expect(imageEntry[0]).toContain('_');
    expect(imageEntry[0]).not.toContain('-');

    // Auto-generated ID: slugify is NOT applied (format: schemaName-hashSubstring)
    expect(paragraphEntry[0]).toMatch(/^paragraph-[A-Za-z0-9]{9}$/);
    expect(paragraphEntry[0]).toContain('-');
    // The raw auto-generated id differs from its slugified form
    expect(paragraphEntry[0]).not.toBe(slugify(paragraphEntry[0]));
  });

  it('should not set children: [] on leaf RawElement or ProseElement', async () => {
    // Image has Children: undefined — a leaf element
    const rawImage = <Image src="test" />;

    // RawElement must not have children: [] set by makeRawElement
    expect('children' in rawImage).toBe(false);

    // ProseElement must not have children: [] set by rawToProse
    const { prose } = await rawToProse({ rawProse: rawImage });
    expect('children' in prose).toBe(false);

    // Same check for a mix (fragment) wrapping leaf elements
    const rawProse = (
      <>
        <Image src="a" />
        <Image src="b" />
      </>
    );
    const { prose: proseMix } = await rawToProse({ rawProse });
    for (const child of proseMix.children!) {
      expect('children' in child).toBe(false);
    }
  });

  it('should throw if idMaker generates empty id', async () => {
    const rawProse = <Image src="cupboard" />;

    await expect(
      rawToProse({
        rawProse,
        idMaker: () => '   ',
      }),
    ).rejects.toThrowError('Empty ID generated from "image" element!');
  });
});
