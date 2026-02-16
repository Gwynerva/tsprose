import { describe, expect, it } from 'vitest';

import type { RawElement } from '@src/element';
import {
  walkPre,
  walkPreSync,
  walkPost,
  walkPostSync,
  WalkNoDeeper,
  WalkStop,
} from '@src/walk';

import { P, B, QED } from './playground.test';

const tree = (
  <>
    <P serif>
      Hello <B>world</B>!
    </P>
    <QED />
    <P center>This is a test.</P>
  </>
);

describe.each([
  {
    name: 'walkPreSync',
    walkFn: walkPreSync as (
      el: RawElement,
      step: (el: RawElement) => void | typeof WalkStop | typeof WalkNoDeeper,
    ) => void | typeof WalkStop,
  },
  {
    name: 'walkPre',
    walkFn: walkPre as unknown as (
      el: RawElement,
      step: (el: RawElement) => void | typeof WalkStop | typeof WalkNoDeeper,
    ) => void | typeof WalkStop | Promise<void | typeof WalkStop>,
  },
])('$name', ({ walkFn }) => {
  it('should walk whole tree in pre-order', async () => {
    const walkedElements: string[] = [];

    await walkFn(tree, (element) => {
      walkedElements.push(element.schema.name);
    });

    expect(walkedElements).toEqual([
      'mix',
      'paragraph',
      'text',
      'bold',
      'text',
      'text',
      'qed',
      'paragraph',
      'text',
    ]);
  });

  it('should stop walking when WalkStop is returned', async () => {
    const walkedElements: string[] = [];

    await walkFn(tree, (element) => {
      walkedElements.push(element.schema.name);
      if (element.schema.name === 'bold') {
        return WalkStop;
      }
    });

    expect(walkedElements).toEqual(['mix', 'paragraph', 'text', 'bold']);
  });

  it('should not walk deeper when WalkNoDeeper is returned', async () => {
    const walkedElements: string[] = [];

    await walkFn(tree, (element) => {
      walkedElements.push(element.schema.name);
      if (element.schema.name === 'paragraph') {
        return WalkNoDeeper;
      }
    });

    expect(walkedElements).toEqual(['mix', 'paragraph', 'qed', 'paragraph']);
  });
});

describe.each([
  {
    name: 'walkPostSync',
    walkFn: walkPostSync as (
      el: RawElement,
      step: (el: RawElement, childrenResults: any[]) => any | typeof WalkStop,
    ) => any | typeof WalkStop,
  },
  {
    name: 'walkPost',
    walkFn: walkPost as unknown as (
      el: RawElement,
      step: (el: RawElement, childrenResults: any[]) => any | typeof WalkStop,
    ) => any | typeof WalkStop | Promise<any | typeof WalkStop>,
  },
])('$name', ({ walkFn }) => {
  it('should walk whole tree in post-order', async () => {
    const walkedElements: string[] = [];

    await walkFn(tree, (element) => {
      walkedElements.push(element.schema.name);
    });

    expect(walkedElements).toEqual([
      'text',
      'text',
      'bold',
      'text',
      'paragraph',
      'qed',
      'text',
      'paragraph',
      'mix',
    ]);
  });

  it('should stop walking in post-order when WalkStop is returned', async () => {
    const walkedElements: string[] = [];

    await walkFn(tree, (element) => {
      walkedElements.push(element.schema.name);
      if (element.schema.name === 'bold') {
        return WalkStop;
      }
    });

    expect(walkedElements).toEqual(['text', 'text', 'bold']);
  });

  it('should collect children results and pass to parent', async () => {
    const result = await walkFn(tree, (element, childrenResults: string[]) => {
      if (childrenResults.length === 0) {
        return element.schema.name;
      }
      return `${element.schema.name}(${childrenResults.join(',')})`;
    });

    expect(result).toBe(
      'mix(paragraph(text,bold(text),text),qed,paragraph(text))',
    );
  });
});
