import { buildChildren, flattenChildren } from './children.js';
import { resolveChildrenRule, type BaseDef } from './def.js';
import { DiagnosticBag, type SourcePos } from './diagnostics.js';
import { FRAGMENT_TYPE, isAnyNode, type AnyNode, type BaseNode } from './node.js';
import type { KitRuntime } from './kit.js';
import { isRef, isRefTarget, type Ref } from './ref.js';
import { validateProps } from './standard.js';
import { isTag, type AnyTag } from './tag.js';
import { errorMessage } from './util.js';

/** Extra per-call information passed by the JSX runtime. */
export interface TagCallContext {
  readonly pos?: SourcePos | undefined;
}

const RESERVED = new Set(['$', 'children', 'key']);

/** Non-enumerable property holding the Ref handle used for `$` (not serialized). */
export const REF_HANDLE = Symbol.for('tsprose.refHandle');
/** Non-enumerable property holding the node's definition (not serialized). */
export const DEF = Symbol.for('tsprose.def');

export function getRefHandle(node: BaseNode): Ref | undefined {
  return (node as unknown as Record<symbol, Ref | undefined>)[REF_HANDLE];
}

/** Non-enumerable property holding the kit the node's tag belongs to (not serialized). */
export const KIT = Symbol.for('tsprose.kit');

export function getDef(node: BaseNode): BaseDef | undefined {
  return (node as unknown as Record<symbol, BaseDef | undefined>)[DEF];
}

export function getKit(node: BaseNode): KitRuntime | undefined {
  return (node as unknown as Record<symbol, KitRuntime | undefined>)[KIT];
}

export function attachDef(node: BaseNode, def: BaseDef, kit?: KitRuntime): void {
  Object.defineProperty(node, DEF, { value: def, enumerable: false, configurable: true });
  if (kit) Object.defineProperty(node, KIT, { value: kit, enumerable: false, configurable: true });
}

/** Create an element node from a tag and raw props. Never throws; problems land in `node.diagnostics`. */
export function instantiate(tag: AnyTag, rawProps: Record<string, unknown>, ctx?: TagCallContext): BaseNode {
  const def = tag.def;
  const kit = tag.kit;
  const pos = ctx?.pos;
  const bag = new DiagnosticBag();
  const props = tag.preset ? { ...tag.preset, ...rawProps } : rawProps;

  // Split props: reserved / kit common / own
  const commonSpec = kit ? kit.commonSpecFor(def) : {};
  const ownInput: Record<string, unknown> = {};
  const commonInput: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (RESERVED.has(key)) continue;
    if (key in commonSpec) commonInput[key] = props[key];
    else ownInput[key] = props[key];
  }

  const own = validateProps(def.props, ownInput);
  for (const issue of own.issues) {
    bag.error(issue.message.startsWith('Unknown prop') ? 'props/unknown' : 'props/invalid', `<${def.name}> ${issue.message}`, pos);
  }
  const common = validateProps(commonSpec, commonInput);
  for (const issue of common.issues) {
    bag.error('props/invalid', `<${def.name}> ${issue.message}`, pos);
  }

  // Ref
  let ref: string | undefined;
  let refHandle: Ref | undefined;
  const refArg = props.$;
  if (refArg !== undefined) {
    if (def.ref === 'none') {
      bag.error('ref/forbidden', `<${def.name}> is not referable (ref: 'none') but received "$"`, pos);
    } else if (typeof refArg === 'string') {
      if (!refArg.trim()) bag.error('ref/invalid', `<${def.name}> received an empty "$"`, pos);
      else ref = refArg;
    } else if (isRef(refArg)) {
      if (refArg.def !== def) {
        bag.error(
          'ref/mismatch',
          `Ref "${refArg.name}" was declared for <${refArg.def.name}> and cannot mark <${def.name}>`,
          pos,
        );
      }
      ref = refArg.name;
      refHandle = refArg;
    } else if (isRefTarget(refArg)) {
      // A serialized handle (`{ $ref: { documentId, name } }`), e.g. passed through JSON to a browser-side generator.
      if (refArg.$ref.name === undefined) {
        bag.error('ref/invalid', `<${def.name}> received a whole-document reference as "$" (an element needs a name)`, pos);
      } else ref = refArg.$ref.name;
    } else {
      bag.error('ref/invalid', `<${def.name}> received an invalid "$" (expected a Ref handle, a serialized { $ref } or a string)`, pos);
    }
  } else if (def.ref === 'required') {
    bag.error('ref/required', `<${def.name}> requires a ref: pass a handle from defineRefs via "$"`, pos);
  }

  const report = (code: string, message: string, severity: 'error' | 'warning' = 'error') => {
    if (severity === 'error') bag.error(code, message, pos);
    else bag.warning(code, message, pos);
  };

  // Children
  const rule = resolveChildrenRule(def);
  const state: Record<string, unknown> = {};
  const children = buildChildren({ raw: props.children, rule, def, kit, bag, pos, props: own.value, report, state });

  // Transient props shape normalize/data only; they are not stored on the node.
  let storedProps = own.value;
  if (def.transient?.length) {
    storedProps = { ...own.value };
    for (const key of def.transient) delete storedProps[key];
  }

  const node: BaseNode = {
    type: def.name,
    kind: def.kind,
    props: storedProps,
    data: undefined,
    children,
    ref,
    meta: common.value,
    pos,
  };
  attachDef(node, def, kit);
  if (refHandle) {
    Object.defineProperty(node, REF_HANDLE, { value: refHandle, enumerable: false });
  }

  if (def.data) {
    try {
      node.data = def.data({ props: own.value, children, node, report, state });
    } catch (error) {
      bag.error('tag/data', `<${def.name}> data() threw: ${errorMessage(error)}`, pos);
    }
  }

  if (kit?.onElement) {
    try {
      kit.onElement({
        node,
        def,
        tag,
        props,
        report,
      });
    } catch (error) {
      bag.error('tag/hook', `<${def.name}> kit onElement threw: ${errorMessage(error)}`, pos);
    }
  }

  if (!bag.empty) node.diagnostics = bag.items;
  return node;
}

/** Build a fragment node from raw children (no whitespace normalization; parents handle it). */
export function makeFragment(rawChildren: unknown, pos?: SourcePos, diagnostics?: DiagnosticBag): BaseNode {
  const bag = diagnostics ?? new DiagnosticBag();
  const children = flattenChildren(rawChildren, bag, pos);
  const node: BaseNode = {
    type: FRAGMENT_TYPE,
    kind: 'block',
    props: {},
    data: undefined,
    children: children.length ? children : undefined,
    ref: undefined,
    meta: {},
    pos,
  };
  if (!bag.empty) node.diagnostics = bag.items;
  return node;
}

export type ComponentResult = AnyNode | string | number | null | undefined | readonly ComponentResult[];

/** What the JSX runtime calls for every `<X …>`. */
export function createElement(type: unknown, props: Record<string, unknown> | null | undefined, pos?: SourcePos): BaseNode {
  const p = props ?? {};
  if (isTag(type)) {
    return type(p, { pos }) as BaseNode;
  }
  if (typeof type === 'function') {
    let result: unknown;
    try {
      result = (type as (props: Record<string, unknown>) => unknown)(p);
    } catch (error) {
      const bag = new DiagnosticBag();
      bag.error('tag/component', `Component ${type.name || '(anonymous)'} threw: ${errorMessage(error)}`, pos);
      return makeFragment(undefined, pos, bag);
    }
    if (isAnyNode(result) && !Array.isArray(result)) {
      return result as BaseNode;
    }
    return makeFragment(result, pos);
  }
  const bag = new DiagnosticBag();
  bag.error(
    'tag/invalid',
    typeof type === 'string'
      ? `Unknown tag <${type}>: TSProse has no intrinsic elements; use a tag created with defineBlock/defineInline`
      : `Invalid JSX tag (${typeof type})`,
    pos,
  );
  return makeFragment(p.children, pos, bag);
}
