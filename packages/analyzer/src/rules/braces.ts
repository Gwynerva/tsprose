import { elementName, forEachJsxContainer, rangeOf, type EsNode } from '../estree.js';
import type { Finding, Manifest } from '../types.js';

/** Text ending in a LaTeX command or a sub/superscript marker: `\sqrt`, `\frac`, `x^`, `a_`. */
const TEX_TAIL = /(?:\\[A-Za-z]+|[_^])$/;

/**
 * LaTeX inside JSX text: `<M>\sqrt{20}</M>` is the text `\sqrt` plus the JSX expression `{20}`, which renders
 * as `\sqrt20` (√2 followed by 0). Report a `{…}` expression glued to a LaTeX command or `^`/`_`.
 * Fix: write math in a template (`{m`\sqrt{20}`}`, `` <M>{String.raw`…`}</M> ``) or an attribute.
 * With `manifest.mathTags`, only the children of those tags are checked.
 */
export function checkBraces(program: EsNode, source: string, manifest?: Manifest): Finding[] {
  const findings: Finding[] = [];
  const mathTags = manifest?.mathTags ? new Set(manifest.mathTags) : undefined;
  forEachJsxContainer(program, (container) => {
    if (mathTags) {
      const name = container.type === 'JSXElement' ? elementName(container) : undefined;
      if (name === undefined || !mathTags.has(name)) return;
    }
    const children = (container.children as EsNode[]) ?? [];
    children.forEach((child, i) => {
      if (child.type !== 'JSXExpressionContainer') return;
      const expr = child.expression as EsNode;
      if (expr.type === 'JSXEmptyExpression') return;
      const prev = children[i - 1];
      if (!prev || prev.type !== 'JSXText') return;
      const [s, e] = rangeOf(prev);
      const text = source.slice(s, e);
      const tail = TEX_TAIL.exec(text);
      if (!tail) return;
      const [cs, ce] = rangeOf(child);
      findings.push({
        code: 'braces/jsx-expression',
        rule: 'braces',
        severity: 'warning',
        message: `"${source.slice(cs, ce)}" after "${tail[0]}" is a JSX expression, not LaTeX braces (the braces are lost); write the math in a template literal`,
        range: [cs, ce],
      });
    });
  });
  return findings;
}
