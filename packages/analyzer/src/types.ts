import type { AnyTag } from 'tsprose';

export type Severity = 'error' | 'warning';

export interface Fix {
  /** Replace `[start, end)` of the source with `text` (insert when start === end). */
  readonly range: readonly [number, number];
  readonly text: string;
}

export interface Finding {
  readonly code: string;
  readonly rule: RuleName;
  readonly severity: Severity;
  readonly message: string;
  /** Source offsets `[start, end)` in the analyzed file. */
  readonly range: readonly [number, number];
  readonly fix?: Fix | undefined;
}

export type RuleName = 'children' | 'props' | 'refs' | 'whitespace' | 'braces';

/**
 * What the analyzer knows about a project: the JSX names in scope and the tags behind them.
 * Projects that expose tags as globals list them under their global names; a plain project maps the exported names.
 */
export interface Manifest {
  /** JSX name (as written in files) → tag. */
  readonly tags: Readonly<Record<string, AnyTag>>;
  /** Whether a kit wraps loose inline content in block containers (then it is not an error). */
  readonly wrapsLooseInline?: boolean | undefined;
  /** Whether the whitespace transform is part of the build (switches the whitespace rule mode). */
  readonly transform?: boolean | undefined;
  /** Names of component functions (not tags) that are known to produce inline content. */
  readonly inlineComponents?: readonly string[] | undefined;
  /** Tags whose text is LaTeX: the `braces` rule checks only their children (default: every element). */
  readonly mathTags?: readonly string[] | undefined;
}

export interface Located extends Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
