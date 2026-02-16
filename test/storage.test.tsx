import { describe, it, expect, vi } from 'vitest';

import { rawToProse } from '@src/rawToProse';
import { fillProseStorage } from '@src/storage';

import {
  B,
  boldStorageCreator,
  Image,
  imageStorageCreator,
  P,
} from './playground.test';

describe('fillProseStorage', () => {
  const createProse = async () => {
    const { prose } = await rawToProse({
      rawProse: (
        <>
          <P>
            Hello, <B storageKey="bold-world">world</B>!
          </P>
          <Image src="my-image.svg" />
          <Image src="image-none" />
        </>
      ),
    });
    return prose;
  };

  const defaultCreators = {
    bold: boldStorageCreator,
    image: imageStorageCreator,
  };

  it('should create storage for all elements with storageKeys', async () => {
    const prose = await createProse();

    const storage = await fillProseStorage({
      prose,
      storageCreators: defaultCreators,
    });

    expect(storage['bold-world']).toBe('bold:world');
    expect(storage['image-my-image.svg']).toEqual({ width: 200, height: 100 });
    expect(storage['image-image-none']).toBeNull();
  });

  it('should not recreate storage for already filled storageKeys', async () => {
    const prose = await createProse();

    const boldCreator = vi.fn(boldStorageCreator);
    const imageCreator = vi.fn(imageStorageCreator);

    const storage = await fillProseStorage({
      prose,
      storageCreators: {
        bold: boldCreator,
        image: imageCreator,
      },
      storage: {
        'bold-world': 'already-filled',
      },
    });

    expect(boldCreator).not.toHaveBeenCalled();
    expect(imageCreator).toHaveBeenCalledTimes(2);
    expect(storage['bold-world']).toBe('already-filled');
    expect(storage['image-my-image.svg']).toEqual({ width: 200, height: 100 });
  });

  it('should not call alterValue for already filled storageKeys', async () => {
    const prose = await createProse();
    const alterValue = vi.fn(({ value }) => value);

    const storage = await fillProseStorage({
      prose,
      storageCreators: defaultCreators,
      alterValue,
      storage: {
        'image-my-image.svg': { width: 999, height: 999 },
      },
    });

    // alterValue should be called only for bold-world and image-image-none (new keys)
    expect(alterValue).toHaveBeenCalledTimes(2);
    expect(alterValue).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'bold-world' }),
    );
    expect(alterValue).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'image-image-none' }),
    );
    expect(alterValue).not.toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'image-my-image.svg' }),
    );

    // Pre-filled value must remain untouched
    expect(storage['image-my-image.svg']).toEqual({ width: 999, height: 999 });
  });

  it('should allow alterValue to intercept and modify storage values', async () => {
    const prose = await createProse();

    const storage = await fillProseStorage({
      prose,
      storageCreators: defaultCreators,
      alterValue: ({ storageKey, value }) => {
        if (storageKey === 'image-my-image.svg') {
          return { width: value.width * 2, height: value.height * 2 };
        }
        if (storageKey === 'bold-world') {
          return value.toUpperCase();
        }
        return value;
      },
    });

    expect(storage['image-my-image.svg']).toEqual({ width: 400, height: 200 });
    expect(storage['bold-world']).toBe('BOLD:WORLD');
    expect(storage['image-image-none']).toBeNull();
  });

  it('should set null when storageCreator returns undefined', async () => {
    const prose = await createProse();

    const storage = await fillProseStorage({
      prose,
      storageCreators: {
        image: imageStorageCreator,
      },
    });

    expect(storage['image-image-none']).toBeNull();
  });

  it('should set null when no storageCreator is provided for a key', async () => {
    const prose = await createProse();

    const storage = await fillProseStorage({
      prose,
      storageCreators: {},
    });

    expect(storage['bold-world']).toBeNull();
    expect(storage['image-my-image.svg']).toBeNull();
    expect(storage['image-image-none']).toBeNull();
  });

  it('should skip elements without storageKey', async () => {
    const { prose } = await rawToProse({
      rawProse: (
        <>
          <P>
            No storage <B>here</B>
          </P>
        </>
      ),
    });

    const storage = await fillProseStorage({
      prose,
      storageCreators: {},
    });

    expect(Object.keys(storage)).toHaveLength(0);
  });

  it('should not duplicate storage for repeated storageKey', async () => {
    const { prose } = await rawToProse({
      rawProse: (
        <>
          <P>
            <B storageKey="shared">first</B> and{' '}
            <B storageKey="shared">second</B>
          </P>
        </>
      ),
    });

    const creator = vi.fn(boldStorageCreator);

    const storage = await fillProseStorage({
      prose,
      storageCreators: { bold: creator },
    });

    // Creator should only be called once even though two elements share the key
    expect(creator).toHaveBeenCalledTimes(1);
    expect(storage['shared']).toBe('bold:first');
  });

  it('should convert alterValue returning undefined to null', async () => {
    const prose = await createProse();

    const storage = await fillProseStorage({
      prose,
      storageCreators: {
        bold: boldStorageCreator,
      },
      alterValue: () => undefined,
    });

    expect(storage['bold-world']).toBeNull();
  });
});
