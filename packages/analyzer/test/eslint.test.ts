import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import plugin from '../src/eslint/index.js';
import { manifest, manifestTransform } from './fixtures.js';

function lint(code: string, settings = manifest, fix = false) {
  const linter = new Linter({ configType: 'flat' });
  const config = [
    {
      files: ['**/*.jsx'],
      plugins: { tsprose: plugin },
      languageOptions: {
        ecmaVersion: 'latest' as const,
        sourceType: 'module' as const,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      settings: { tsprose: settings },
      rules: plugin.configs.recommended.rules,
    },
  ];
  return fix
    ? linter.verifyAndFix(code, config, { filename: 'doc.jsx' })
    : linter.verify(code, config, { filename: 'doc.jsx' });
}

describe('ESLint plugin', () => {
  it('reports findings through the four rules', () => {
    const messages = lint(
      'const x = <P centre>text <Qed /></P>;',
    ) as Linter.LintMessage[];
    expect(
      messages.map((m) => [m.ruleId, m.severity, m.line, m.column]),
    ).toEqual([
      ['tsprose/valid-props', 2, 1, 14],
      ['tsprose/valid-children', 2, 1, 26],
    ]);
    expect(messages[1]!.message).toContain('children/kind');
  });

  it('autofixes lost spaces', () => {
    const result = lint(
      'const x = (\n  <P>\n    word\n    <B>b</B>\n  </P>\n);',
      manifest,
      true,
    ) as Linter.FixReport;
    expect(result.fixed).toBe(true);
    expect(result.output).toContain("{' '}<B>b</B>");
    expect(result.messages).toEqual([]);
  });

  it('with transform setting reports space hacks', () => {
    const messages = lint(
      "const x = (\n  <P>\n    word{' '}\n    <B>b</B>\n  </P>\n);",
      manifestTransform,
    ) as Linter.LintMessage[];
    expect(messages.map((m) => m.ruleId)).toEqual(['tsprose/whitespace']);
  });

  it('refs rule works on JSX files', () => {
    const messages = lint(
      'const refs = defineRefs({ a: P });\nconst d = <Qed />;',
    ) as Linter.LintMessage[];
    expect(messages.map((m) => m.ruleId)).toEqual(['tsprose/refs']);
  });

  it('accepts a JSON tags description as settings', async () => {
    const { describeTags } = await import('tsprose');
    const description = JSON.parse(JSON.stringify(describeTags(manifest.tags)));
    const messages = lint(
      'const x = <P centre>text <Qed /></P>;',
      description,
    ) as Linter.LintMessage[];
    expect(messages.map((m) => m.ruleId)).toEqual([
      'tsprose/valid-props',
      'tsprose/valid-children',
    ]);
  });

  it('reports the package version', async () => {
    const { createRequire } = await import('node:module');
    expect(plugin.meta?.version).toBe(
      createRequire(import.meta.url)('../package.json').version,
    );
  });

  it('throws a clear error without settings', () => {
    const linter = new Linter({ configType: 'flat' });
    expect(() =>
      linter.verify(
        'const x = <P>x</P>;',
        [
          {
            files: ['**/*.jsx'],
            plugins: { tsprose: plugin },
            languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
            rules: { 'tsprose/valid-props': 'error' },
          },
        ],
        { filename: 'd.jsx' },
      ),
    ).toThrow(/settings\.tsprose/);
  });
});
