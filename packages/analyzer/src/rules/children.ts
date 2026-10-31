import { resolveChildrenRule, type AnyTag } from 'tsprose';
import { classifyChildren, elementName, rangeOf, type EsNode } from '../estree.js';
import type { Finding, Manifest } from '../types.js';

/** Nesting, arity and content-model checks for one JSX element. */
export function checkChildren(element: EsNode, source: string, manifest: Manifest): Finding[] {
  const name = elementName(element);
  const tag = name ? manifest.tags[name] : undefined;
  if (!tag) return [];
  const def = tag.def;
  const rule = resolveChildrenRule(def);
  const findings: Finding[] = [];
  const children = classifyChildren(element, source);
  const report = (code: string, message: string, node: EsNode) => {
    findings.push({ code, rule: 'children', severity: 'error', message, range: rangeOf(node) });
  };
  const label = `<${name}>`;
  const tagOf = (childName: string | undefined): AnyTag | undefined => (childName ? manifest.tags[childName] : undefined);
  const wraps = manifest.wrapsLooseInline === true && !!tag.kit?.wrapLooseInline;

  // A definition with `normalize` rewrites its children (wraps loose content, generates it from a prop…):
  // what is written is not what the rule applies to, so only "no children allowed" can be checked statically.
  if (def.normalize && rule.mode !== 'none') return findings;

  if (rule.mode === 'none') {
    for (const child of children) {
      if (child.kind !== 'unknown') report('children/forbidden', `${label} does not accept children`, child.node);
    }
    return findings;
  }

  let unknown = false;
  const types: string[] = [];
  for (const child of children) {
    if (child.kind === 'unknown') {
      unknown = true;
      continue;
    }
    if (child.kind === 'text') {
      // Adjacent text pieces (`\\sqrt` + `{3}`) merge into one text node at runtime.
      if (types[types.length - 1] !== 'text') types.push('text');
      if (rule.context === 'block' && !wraps) {
        report('children/kind', `${label} accepts only block children, received text`, child.node);
      }
      continue;
    }
    const childTag = tagOf(child.name);
    if (!childTag) {
      // component or unknown tag
      if (child.name && manifest.inlineComponents?.includes(child.name)) {
        types.push('text');
        if (rule.context === 'block' && !wraps) report('children/kind', `${label} accepts only block children, received inline <${child.name}>`, child.node);
      } else unknown = true;
      continue;
    }
    const childDef = childTag.def;
    types.push(childDef.name);
    if (rule.mode === 'kind' && childDef.kind !== rule.kind) {
      if (!(rule.kind === 'block' && childDef.kind === 'inline' && wraps)) {
        report('children/kind', `${label} accepts only ${rule.kind} children, received <${child.name}> (${childDef.kind})`, child.node);
      }
    } else if (rule.mode === 'tags' && !rule.tags!.has(childDef.name)) {
      report(
        'children/type',
        `${label} cannot contain <${child.name}>; allowed: ${[...rule.tags!.keys()].map((t) => `<${t}>`).join(', ')}`,
        child.node,
      );
    }
  }

  if (unknown) return findings;

  const count = types.length;
  if (count < rule.min) {
    report('children/arity', count === 0 ? `${label} requires children` : `${label} requires at least ${rule.min} children, found ${count}`, element.openingElement as EsNode);
  } else if (count > rule.max) {
    report('children/arity', `${label} accepts at most ${rule.max} children, found ${count}`, element.openingElement as EsNode);
  }
  if (rule.counts) {
    const seen = new Map<string, number>();
    for (const type of types) seen.set(type, (seen.get(type) ?? 0) + 1);
    for (const [type, [min, max]] of rule.counts) {
      const n = seen.get(type) ?? 0;
      if (n < min || n > max) {
        const expected = min === max ? `exactly ${min}` : max === Number.POSITIVE_INFINITY ? `at least ${min}` : min === 0 ? `at most ${max}` : `${min} to ${max}`;
        report('children/count', `${label} requires ${expected} <${type}>, found ${n}`, element.openingElement as EsNode);
      }
    }
  }
  if (rule.pattern && !rule.pattern.test(types)) {
    report('children/pattern', `${label} children must match "${rule.pattern.source}", found ${types.join(' ') || '(nothing)'}`, element.openingElement as EsNode);
  }
  return findings;
}
