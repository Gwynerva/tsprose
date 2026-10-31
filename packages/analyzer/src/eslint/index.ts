import type { ESLint, Linter, Rule } from 'eslint';
import { analyzeProgram } from '../analyze.js';
import type { EsNode } from '../estree.js';
import type { TagsDescription } from 'tsprose';
import { toManifest } from '../manifest.js';
import type { Finding, Manifest, RuleName } from '../types.js';

/**
 * ESLint plugin. Configure the manifest through settings:
 *
 * ```js
 * import tsprose from '@tsprose/analyzer/eslint';
 * import { manifest } from './tsprose.config.ts';
 * export default [{ files: ['content/**\/*.tsx'], plugins: { tsprose }, settings: { tsprose: manifest }, rules: tsprose.configs.recommended.rules }];
 * ```
 *
 * Any ESTree-JSX parser works (espree with `ecmaFeatures.jsx`, typescript-eslint for TSX).
 */

const cache = new WeakMap<object, Finding[]>();

function findingsFor(context: Rule.RuleContext, rule: RuleName): Finding[] {
  const setting = (context.settings as { tsprose?: Manifest | TagsDescription }).tsprose;
  const manifest = setting ? toManifest(setting, { wrapsLooseInline: true, transform: true }) : undefined;
  if (!manifest) {
    throw new Error('@tsprose/analyzer: settings.tsprose (a Manifest) is required');
  }
  const ast = context.sourceCode.ast as unknown as EsNode;
  let all = cache.get(ast);
  if (!all) {
    all = analyzeProgram(ast, context.sourceCode.text, context.filename, { manifest });
    cache.set(ast, all);
  }
  return all.filter((f) => f.rule === rule);
}

function makeRule(rule: RuleName, description: string): Rule.RuleModule {
  return {
    meta: { type: 'problem', docs: { description }, fixable: 'code', schema: [], messages: { finding: '{{message}}' } },
    create(context) {
      return {
        Program() {
          for (const f of findingsFor(context, rule)) {
            const start = context.sourceCode.getLocFromIndex(f.range[0]);
            const end = context.sourceCode.getLocFromIndex(f.range[1]);
            context.report({
              loc: { start, end },
              messageId: 'finding',
              data: { message: `${f.code}: ${f.message}` },
              fix: f.fix ? (fixer) => fixer.replaceTextRange([f.fix!.range[0], f.fix!.range[1]], f.fix!.text) : undefined,
            });
          }
        },
      };
    },
  };
}

const rules: Record<string, Rule.RuleModule> = {
  'valid-children': makeRule('children', 'Children must satisfy the tag definition (kind, allowed types, arity, content model)'),
  'valid-props': makeRule('props', 'Only defined props; `$` where the definition requires or allows it'),
  refs: makeRule('refs', 'Each handle from defineRefs is used exactly once in its file'),
  whitespace: makeRule('whitespace', 'Line breaks between inline content and {\' \'} hacks'),
  braces: makeRule('braces', 'LaTeX braces written in JSX text become JSX expressions (\\sqrt{20} renders as \\sqrt20)'),
};

const plugin: ESLint.Plugin & { configs: { recommended: Linter.Config } } = {
  meta: { name: '@tsprose/analyzer', version: '2.0.0-alpha.0' },
  rules,
  configs: {
    recommended: {
      rules: {
        'tsprose/valid-children': 'error',
        'tsprose/valid-props': 'error',
        'tsprose/refs': 'error',
        'tsprose/whitespace': 'warn',
        'tsprose/braces': 'warn',
      },
    },
  },
};

export default plugin;
export { rules };
