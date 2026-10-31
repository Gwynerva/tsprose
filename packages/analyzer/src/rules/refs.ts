import { attributesOf, collectDefinedRefs, forEachJsxElement, rangeOf, refUsage, type EsNode } from '../estree.js';
import type { Finding } from '../types.js';

/**
 * File-local refs bookkeeping: every handle declared with `defineRefs({ … })` in this file must be
 * used exactly once via `$={refs.name}`. Cross-file usage is verified by `compile`.
 */
export function checkRefs(program: EsNode): Finding[] {
  const defined = collectDefinedRefs(program);
  if (defined.size === 0) return [];
  const findings: Finding[] = [];
  const used = new Map<string, Map<string, EsNode[]>>();
  forEachJsxElement(program, (element) => {
    for (const attr of attributesOf(element).attributes) {
      if (attr.name !== '$') continue;
      const usage = refUsage(attr);
      if (!usage || !defined.has(usage.object)) continue;
      let names = used.get(usage.object);
      if (!names) used.set(usage.object, (names = new Map()));
      const list = names.get(usage.name);
      if (list) list.push(attr.node);
      else names.set(usage.name, [attr.node]);
    }
  });
  for (const [object, { names }] of defined) {
    const usedNames = used.get(object) ?? new Map<string, EsNode[]>();
    for (const [name, prop] of names) {
      const uses = usedNames.get(name);
      if (!uses) {
        findings.push({ code: 'ref/unused', rule: 'refs', severity: 'error', message: `Ref "${object}.${name}" is declared but never used in this file`, range: rangeOf(prop) });
      } else if (uses.length > 1) {
        for (const node of uses.slice(1)) {
          findings.push({ code: 'ref/duplicate', rule: 'refs', severity: 'error', message: `Ref "${object}.${name}" is used ${uses.length} times; a handle marks exactly one element`, range: rangeOf(node) });
        }
      }
    }
    for (const [name, uses] of usedNames) {
      if (!names.has(name)) {
        for (const node of uses) {
          findings.push({ code: 'ref/unknown', rule: 'refs', severity: 'error', message: `"${object}.${name}" is not declared in defineRefs`, range: rangeOf(node) });
        }
      }
    }
  }
  return findings;
}
