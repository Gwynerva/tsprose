import { describe, expect, it } from 'vitest';

import { mixSchema } from '@src/default/mix';
import { textSchema } from '@src/default/text';
import type { ToRawElement } from '@src/element';
import { isRawElement } from '@src/elementUtils';

describe('Mix and Text', () => {
  it('should throw when mix element has no children', () => {
    expect(() => <></>).toThrow();
  });

  it('should create mix element with text children', () => {
    const mixElement = (<>Hello World</>) as ToRawElement<typeof mixSchema>;
    expect(isRawElement(mixElement, mixSchema)).toBe(true);
    const [textElement] = mixElement.children;
    expect(isRawElement(textElement, textSchema)).toBe(true);
    expect(textElement.data).toBe('Hello World');
  });

  it('should flatten subsequent mix elements', () => {
    const mixElement = (
      <>
        <>
          <>Hello</>
        </>
        <>World</>
      </>
    ) as ToRawElement<typeof mixSchema>;
    expect(isRawElement(mixElement, mixSchema)).toBe(true);
    const [textElement1, textElement2] = mixElement.children;
    expect(isRawElement(textElement1, textSchema)).toBe(true);
    expect(isRawElement(textElement2, textSchema)).toBe(true);
    expect(textElement1.data).toBe('Hello');
    expect(textElement2.data).toBe('World');
  });

  it('should stringify unknown children to text and drop falsey values (except 0)', () => {
    const mixElement = (
      <>
        Hello
        {123}
        {true}
        {false}
        {null}
        {undefined}
        {''}
        {0}
      </>
    ) as ToRawElement<typeof mixSchema>;
    expect(isRawElement(mixElement, mixSchema)).toBe(true);
    const [textElement] = mixElement.children;
    expect(isRawElement(textElement, textSchema)).toBe(true);
    expect(textElement.data).toBe('Hello123true0');
  });

  it('should accept any function as a tag', () => {
    const CustomTag = (props: { children: number }) => {
      return <>{props.children}</>;
    };

    const mixElement = (<CustomTag>{1337}</CustomTag>) as ToRawElement<
      typeof mixSchema
    >;
    expect(isRawElement(mixElement, mixSchema)).toBe(true);
    const [textElement] = mixElement.children;
    expect(isRawElement(textElement, textSchema)).toBe(true);
    expect(textElement.data).toBe('1337');
  });
});
