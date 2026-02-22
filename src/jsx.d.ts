import type { RawElement } from './element.js';

declare global {
  namespace JSX {
    /** No intrinsic elements to avoid first letter casing confusion. */
    interface IntrinsicElements {}

    /**
     * General raw element.
     *
     * Unfortunately, JSX/TSX tag constructions (<...>) always return general JSX.Element type.
     * No matter what tag you use, it will be widened to JSX.Element loosing all generics.
     * This prevents some cool compile/editor time checkings like prohibiting certain tags in specific contexts (blocks in inliners and etc.)
     * All this has to be done in runtime or with other tools, like ESLint.
     *
     * @todo Remove this when TypeScript supports proper JSX/TSX generics.
     * @see [TypeScript issue](https://github.com/microsoft/TypeScript/issues/21699)
     */
    type Element = RawElement;
  }
}
