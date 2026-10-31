/**
 * Minimal ESTree-JSX view shared by the oxc-based analyzer and the ESLint rules.
 * Both ASTs are ESTree compatible; only position fields differ (`start/end` vs `range`).
 */
export interface EsNode {
  type: string;
  start?: number;
  end?: number;
  range?: [number, number];
  [key: string]: unknown;
}

export function rangeOf(node: EsNode): [number, number] {
  if (node.range) return node.range;
  return [node.start ?? 0, node.end ?? 0];
}

export function jsxName(node: EsNode | undefined): string | undefined {
  if (!node) return undefined;
  switch (node.type) {
    case 'JSXIdentifier':
      return node.name as string;
    case 'JSXMemberExpression':
      return `${jsxName(node.object as EsNode)}.${jsxName(node.property as EsNode)}`;
    case 'JSXNamespacedName':
      return `${jsxName(node.namespace as EsNode)}:${jsxName(node.name as EsNode)}`;
    default:
      return undefined;
  }
}

export function elementName(element: EsNode): string | undefined {
  const opening = element.openingElement as EsNode | undefined;
  return jsxName(opening?.name as EsNode | undefined);
}

export interface Attribute {
  readonly name: string;
  readonly node: EsNode;
  readonly value: EsNode | null;
}

export function attributesOf(element: EsNode): { attributes: Attribute[]; hasSpread: boolean } {
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
    if (name) attributes.push({ name, node: attr, value: (attr.value as EsNode | null) ?? null });
  }
  return { attributes, hasSpread };
}

export type ChildClass =
  | { kind: 'text'; node: EsNode }
  | { kind: 'element'; node: EsNode; name: string | undefined }
  | { kind: 'unknown'; node: EsNode };

const WS_ONLY = /^[ \t\r\n\f]*$/;

/** Flatten children (fragments spread) and classify them like the runtime would. */
export function classifyChildren(element: EsNode, source: string): ChildClass[] {
  const out: ChildClass[] = [];
  const visit = (children: EsNode[]) => {
    for (const child of children) {
      switch (child.type) {
        case 'JSXText': {
          const [s, e] = rangeOf(child);
          const raw = source.slice(s, e);
          if (!WS_ONLY.test(raw)) out.push({ kind: 'text', node: child });
          break;
        }
        case 'JSXExpressionContainer': {
          const expr = child.expression as EsNode;
          if (expr.type === 'JSXEmptyExpression') break;
          if (expr.type === 'Literal') {
            const value = expr.value;
            if (typeof value === 'string') {
              if (!WS_ONLY.test(value) || value === '') {
                if (value !== '') out.push({ kind: 'text', node: child });
              }
            } else if (typeof value === 'number') out.push({ kind: 'text', node: child });
            else if (value === null || typeof value === 'boolean') break;
            else out.push({ kind: 'unknown', node: child });
          } else if (expr.type === 'TemplateLiteral') out.push({ kind: 'text', node: child });
          else out.push({ kind: 'unknown', node: child });
          break;
        }
        case 'JSXElement':
          out.push({ kind: 'element', node: child, name: elementName(child) });
          break;
        case 'JSXFragment':
          visit(child.children as EsNode[]);
          break;
        default:
          out.push({ kind: 'unknown', node: child });
      }
    }
  };
  visit((element.children as EsNode[]) ?? []);
  return out;
}

/** Depth-first enumeration of every JSX element in an ESTree program. */
export function forEachJsxElement(root: EsNode, visit: (element: EsNode) => void): void {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const n = node as EsNode;
    if (n.type === 'JSXElement') visit(n);
    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'loc' || key === 'range' || key === 'type' || key === 'tokens' || key === 'comments') continue;
      const value = n[key];
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(root);
}

/** Every call `defineRefs(...)` whose last argument is an object literal: variable name → ref names. */
export function collectDefinedRefs(root: EsNode): Map<string, { names: Map<string, EsNode>; node: EsNode }> {
  const result = new Map<string, { names: Map<string, EsNode>; node: EsNode }>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const n = node as EsNode;
    if (n.type === 'VariableDeclarator') {
      const init = n.init as EsNode | null;
      const id = n.id as EsNode;
      if (init && init.type === 'CallExpression' && id.type === 'Identifier') {
        const callee = init.callee as EsNode;
        if (callee.type === 'Identifier' && callee.name === 'defineRefs') {
          const args = init.arguments as EsNode[];
          const last = args[args.length - 1];
          if (last && last.type === 'ObjectExpression') {
            const names = new Map<string, EsNode>();
            for (const prop of last.properties as EsNode[]) {
              if (prop.type !== 'Property') continue;
              const key = prop.key as EsNode;
              const name = key.type === 'Identifier' ? (key.name as string) : key.type === 'Literal' ? String(key.value) : undefined;
              if (name) names.set(name, prop);
            }
            result.set(id.name as string, { names, node: n });
          }
        }
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'loc' || key === 'range' || key === 'type') continue;
      const value = n[key];
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(root);
  return result;
}

/** `$={refs.name}` → `{ object: 'refs', name: 'name' }` */
export function refUsage(attr: Attribute): { object: string; name: string } | undefined {
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
