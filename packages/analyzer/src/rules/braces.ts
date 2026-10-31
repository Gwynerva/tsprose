import { forEachJsxElement, rangeOf, type EsNode } from '../estree.js';
import type { Finding } from '../types.js';

/** Text ending in a LaTeX command or a sub/superscript marker: `\sqrt`, `\frac`, `x^`, `a_`. */
const TEX_TAIL = /(?:\\[A-Za-z]+|[_^])$/;

/**
 * LaTeX inside JSX text: `<M>\sqrt{20}</M>` is the text `\sqrt` plus the JSX expression `{20}`, which renders
 * as `\sqrt20` (√2 followed by 0). Report a `{…}` expression glued to a LaTeX command or `^`/`_`.
 * Fix: write math in a template (`{m`\sqrt{20}`}`, `` <M>{String.raw`…`}</M> ``) or an attribute.
 */
export function checkBraces(program: EsNode, source: string): Finding[] {
  const findings: Finding[] = [];
  forEachJsxElement(program, (element) => {
    const children = (element.children as EsNode[]) ?? [];
    children.forEach((child, i) => {
      if (child.type !== 'JSXExpressionContainer') return;
      const expr = child.expression as EsNode;
      if (expr.type === 'JSXEmptyExpression') return;
      const prev = children[i - 1];
      if (!prev || prev.type !== 'JSXText') return;
      const [s, e] = rangeOf(prev);
      const text = source.slice(s, e);
      if (!TEX_TAIL.test(text)) return;
      const [cs, ce] = rangeOf(child);
      findings.push({
        code: 'braces/jsx-expression',
        rule: 'braces',
        severity: 'warning',
        message: `"${source.slice(cs, ce)}" after "${text.match(TEX_TAIL)![0]}" is a JSX expression, not LaTeX braces (the braces are lost); write the math in a template literal`,
        range: [cs, ce],
      });
    });
  });
  return findings;
}
