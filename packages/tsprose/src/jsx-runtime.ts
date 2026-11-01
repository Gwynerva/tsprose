import {
  createElement,
  makeFragment,
  type ComponentResult,
} from './element.js';
import type { BaseNode } from './node.js';
import type { AnyTag } from './tag.js';

/** Fragment marker used by the JSX transform for `<>…</>`. */
export const Fragment: unique symbol = Symbol.for('tsprose.fragment');

/**
 * Hidden prop carrying `[file, line, column]`, emitted by `@tsprose/transform` with `positions: true` for
 * pipelines that cannot use the dev JSX runtime (jiti, production builds). Stripped before the tag sees props.
 */
export const POSITION_PROP = '__tsprosePos';

function create(
  type: unknown,
  props: Record<string, unknown> | null | undefined,
  pos?: { fileName: string; lineNumber: number; columnNumber: number },
): BaseNode {
  let position = pos
    ? { file: pos.fileName, line: pos.lineNumber, column: pos.columnNumber }
    : undefined;
  if (props && POSITION_PROP in props) {
    const { [POSITION_PROP]: hidden, ...rest } = props;
    props = rest;
    if (!position && Array.isArray(hidden) && hidden.length === 3) {
      position = {
        file: String(hidden[0]),
        line: Number(hidden[1]),
        column: Number(hidden[2]),
      };
    }
  }
  if (type === Fragment) {
    return makeFragment(props?.children, position);
  }
  return createElement(type, props, position);
}

export function jsx(
  type: unknown,
  props: Record<string, unknown> | null | undefined,
  _key?: unknown,
): BaseNode {
  return create(type, props);
}

export const jsxs: typeof jsx = jsx;

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null | undefined,
  _key?: unknown,
  _isStaticChildren?: boolean,
  source?: { fileName: string; lineNumber: number; columnNumber: number },
  _self?: unknown,
): BaseNode {
  return create(type, props, source);
}

export namespace JSX {
  /** Every JSX expression has this type (TypeScript cannot carry per-tag types through JSX). */
  export type Element = BaseNode;
  /** Only TSProse tags and prose components may be used as JSX tags; no intrinsic (lowercase) elements. */
  export type ElementType = AnyTag | ((props: any) => ComponentResult);
  export interface IntrinsicElements {}
  export interface ElementChildrenAttribute {
    children: {};
  }
}
