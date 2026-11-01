import {
  classifyJsxChild,
  elementName,
  jsxName,
  rangeOf,
  walkAst,
  type AstNode,
} from '@tsprose/transform/tooling';

/**
 * Minimal ESTree-JSX view shared by the oxc-based analyzer and the ESLint rules.
 * Both ASTs are ESTree compatible; only position fields differ (`start/end` vs `range`).
 */
export type EsNode = AstNode;

export { elementName, jsxName, rangeOf };

export interface Attribute {
  readonly name: string;
  readonly node: EsNode;
  readonly value: EsNode | null;
}

export function attributesOf(element: EsNode): {
  attributes: Attribute[];
  hasSpread: boolean;
} {
  const opening = element.openingElement as EsNode;
  const list = (opening.attributes as EsNode[]) ?? [];
  const attributes: Attribute[] = [];
  let hasSpread = false;
  for (const attr of list) {
    if (attr.type === 'JSXSpreadAttribute') {
      hasSpread = true;
      continue;
    }
    const name = jsxName(attr.name as EsNode);
    if (name)
      attributes.push({
        name,
        node: attr,
        value: (attr.value as EsNode | null) ?? null,
      });
  }
  return { attributes, hasSpread };
}

export type ChildClass =
  | { kind: 'text'; node: EsNode }
  | { kind: 'element'; node: EsNode; name: string | undefined }
  | { kind: 'unknown'; node: EsNode };

/**
 * Flatten children (fragments spread) and classify them like the runtime would: text and strings are text;
 * whitespace, `{' '}`, `{''}`, `{' '}` (a paragraph break), comments, `null`/booleans produce no node.
 */
export function classifyChildren(
  element: EsNode,
  source: string,
): ChildClass[] {
  const out: ChildClass[] = [];
  const visit = (children: EsNode[]) => {
    for (const node of children) {
      const child = classifyJsxChild(node, source);
      switch (child.kind) {
        case 'text':
        case 'string':
        case 'template':
          out.push({ kind: 'text', node });
          break;
        case 'literal':
          if (typeof child.value === 'number') out.push({ kind: 'text', node });
          else if (child.value !== null && typeof child.value !== 'boolean')
            out.push({ kind: 'unknown', node });
          break;
        case 'element':
          out.push({ kind: 'element', node, name: child.name });
          break;
        case 'fragment':
          visit((node.children as EsNode[]) ?? []);
          break;
        case 'expression':
          out.push({ kind: 'unknown', node });
          break;
        // whitespace, space, glue, break, comment: nothing
      }
    }
  };
  visit((element.children as EsNode[]) ?? []);
  return out;
}

/** Depth-first enumeration of every JSX element in an ESTree program. */
export function forEachJsxElement(
  root: EsNode,
  visit: (element: EsNode) => void,
): void {
  walkAst<EsNode>(root, (n) => {
    if (n.type === 'JSXElement') visit(n);
  });
}

/** Depth-first enumeration of every JSX element and fragment (everything that has JSX children). */
export function forEachJsxContainer(
  root: EsNode,
  visit: (container: EsNode) => void,
): void {
  walkAst<EsNode>(root, (n) => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') visit(n);
  });
}

/** Every call `defineRefs(...)` whose last argument is an object literal: variable name → ref names. */
export function collectDefinedRefs(
  root: EsNode,
): Map<string, { names: Map<string, EsNode>; node: EsNode }> {
  const result = new Map<
    string,
    { names: Map<string, EsNode>; node: EsNode }
  >();
  walkAst<EsNode>(root, (n) => {
    if (n.type !== 'VariableDeclarator') return;
    const init = n.init as EsNode | null;
    const id = n.id as EsNode;
    if (!init || init.type !== 'CallExpression' || id.type !== 'Identifier')
      return;
    const callee = init.callee as EsNode;
    if (callee.type !== 'Identifier' || callee.name !== 'defineRefs') return;
    const args = init.arguments as EsNode[];
    const last = args[args.length - 1];
    if (!last || last.type !== 'ObjectExpression') return;
    const names = new Map<string, EsNode>();
    for (const prop of last.properties as EsNode[]) {
      if (prop.type !== 'Property') continue;
      const key = prop.key as EsNode;
      const name =
        key.type === 'Identifier'
          ? (key.name as string)
          : key.type === 'Literal'
            ? String(key.value)
            : undefined;
      if (name) names.set(name, prop);
    }
    result.set(id.name as string, { names, node: n });
  });
  return result;
}

/** `$={refs.name}` → `{ object: 'refs', name: 'name' }` */
export function refUsage(
  attr: Attribute,
): { object: string; name: string } | undefined {
  const value = attr.value;
  if (!value || value.type !== 'JSXExpressionContainer') return undefined;
  const expr = value.expression as EsNode;
  if (expr.type !== 'MemberExpression') return undefined;
  const object = expr.object as EsNode;
  const property = expr.property as EsNode;
  if (object.type !== 'Identifier') return undefined;
  const name = expr.computed
    ? property.type === 'Literal'
      ? String(property.value)
      : undefined
    : property.type === 'Identifier'
      ? (property.name as string)
      : undefined;
  return name ? { object: object.name as string, name } : undefined;
}
