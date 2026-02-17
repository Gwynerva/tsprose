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

  it('should apply custom slugify to generated ids', async () => {
    const slugify = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const rawProse = (
      <>
        <Image src="cupboard" />
        <P>Hello world</P>
      </>
    );

    const { takenIds } = await rawToProse({
      rawProse,
      slugify,
    });

    const ids = [...takenIds.keys()];
    for (const id of ids) {
      expect(id).toContain('_');
      expect(id).not.toContain('-');
      expect(id).toBe(slugify(id));
    }
    expect(ids.length).toBeGreaterThan(0);
  });
});
