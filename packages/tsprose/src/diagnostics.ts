/** Source position of a JSX element (1-based line and column), captured via `jsxDEV`. */
export interface SourcePos {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export type Severity = 'error' | 'warning';

/**
 * Diagnostic codes are stable strings grouped by area: `props/*`, `children/*`, `ref/*`,
 * `document/*`, `include/*`, `derive/*`, `tag/*`.
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly pos?: SourcePos | undefined;
  /** Human readable ancestry, e.g. `['document', 'theorem#pythagoras', 'paragraph']`. */
  readonly path?: readonly string[] | undefined;
}

export function formatPos(pos: SourcePos | undefined): string {
  return pos ? `${pos.file}:${pos.line}:${pos.column}` : '<unknown position>';
}

export function formatDiagnostic(d: Diagnostic): string {
  const head = `${d.severity} ${d.code}: ${d.message}`;
  const where = `  at ${formatPos(d.pos)}`;
  const path = d.path && d.path.length ? `  in ${d.path.join(' > ')}` : undefined;
  return [head, where, path].filter(Boolean).join('\n');
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join('\n\n');
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Error thrown by strict operations; carries all collected diagnostics. */
export class TSProseError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(message: string, diagnostics: readonly Diagnostic[] = []) {
    super(diagnostics.length ? `${message}\n\n${formatDiagnostics(diagnostics)}` : message);
    this.name = 'TSProseError';
    this.diagnostics = diagnostics;
  }
}

/** Mutable collector used while building nodes. */
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  error(code: string, message: string, pos?: SourcePos, path?: readonly string[]): void {
    this.items.push({ severity: 'error', code, message, pos, path });
  }

  warning(code: string, message: string, pos?: SourcePos, path?: readonly string[]): void {
    this.items.push({ severity: 'warning', code, message, pos, path });
  }

  get empty(): boolean {
    return this.items.length === 0;
  }
}
