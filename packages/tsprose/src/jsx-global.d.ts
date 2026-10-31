// Opt-in global `JSX` namespace for user code that names JSX types outside of tag definitions
// (e.g. `(hint?: JSX.Element) => …`). Add "tsprose/jsx-global" to tsconfig `types`.
// Type checking of JSX itself always uses the module namespace from `tsprose/jsx-runtime`.
import type { JSX as TSProseJSX } from './jsx-runtime.js';

declare global {
  namespace JSX {
    type Element = TSProseJSX.Element;
    type ElementType = TSProseJSX.ElementType;
    type ElementChildrenAttribute = TSProseJSX.ElementChildrenAttribute;
  }
}

export {};
