import { isObjectSchema, propKeys } from 'tsprose';
import { attributesOf, elementName, rangeOf, type EsNode } from '../estree.js';
import type { Finding, Manifest } from '../types.js';

const RESERVED = new Set(['$', 'children', 'key']);

/** Unknown props, missing/forbidden `$`, preset props passed again. */
export function checkProps(element: EsNode, manifest: Manifest): Finding[] {
  const name = elementName(element);
  const tag = name ? manifest.tags[name] : undefined;
  if (!tag) return [];
  const def = tag.def;
  const findings: Finding[] = [];
  const { attributes, hasSpread } = attributesOf(element);
  const report = (
    code: string,
    message: string,
    node: EsNode,
    severity: 'error' | 'warning' = 'error',
  ) => {
    findings.push({
      code,
      rule: 'props',
      severity,
      message,
      range: rangeOf(node),
    });
  };
  const known = new Set<string>([
    ...propKeys(def.props),
    ...Object.keys(tag.kit?.commonSpecFor(def) ?? {}),
  ]);
  // A whole-object schema without introspectable keys cannot be checked statically.
  const openProps =
    isObjectSchema(def.props) && propKeys(def.props).length === 0;
  const preset = tag.preset
    ? new Set(Object.keys(tag.preset))
    : new Set<string>();
  let hasRef = false;
  for (const attr of attributes) {
    if (attr.name === '$') {
      hasRef = true;
      if (def.ref === 'none')
        report(
          'ref/forbidden',
          `<${name}> is not referable (ref: 'none') but has "$"`,
          attr.node,
        );
      continue;
    }
    if (RESERVED.has(attr.name)) continue;
    if (preset.has(attr.name))
      report(
        'props/preset',
        `"${attr.name}" is fixed by the preset <${name}> and cannot be passed again`,
        attr.node,
      );
    else if (!openProps && !known.has(attr.name))
      report(
        'props/unknown',
        `<${name}> has no prop "${attr.name}"`,
        attr.node,
      );
  }
  if (!hasRef && !hasSpread && def.ref === 'required') {
    report(
      'ref/required',
      `<${name}> requires a ref: pass a handle from defineRefs via "$"`,
      element.openingElement as EsNode,
    );
  }
  return findings;
}
