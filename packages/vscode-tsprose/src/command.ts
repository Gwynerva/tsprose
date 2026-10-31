import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Split a command setting (`bunx tsprose-fmt`, `"C:\Program Files\bun\bun.exe" x tsprose-fmt`) into words.
 * Double and single quotes group words; quotes themselves are removed. No other shell syntax is interpreted.
 */
export function splitCommand(command: string): string[] {
  const words: string[] = [];
  let word = '';
  let quote: '"' | "'" | undefined;
  let inWord = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = undefined;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/**
 * Quote one argument for `cmd.exe`: inside double quotes `&|<>^()` and spaces are literal. `"` cannot occur in
 * Windows paths; it is doubled anyway.
 */
export function quoteWindowsArg(arg: string): string {
  if (arg !== '' && /^[\w\-.:\\/=@+,]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export interface SpawnSpec {
  readonly file: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

/**
 * How to spawn `command` with `args`. POSIX: the first word is executed directly, no shell. Windows: through
 * `cmd.exe` (needed for `.cmd` shims such as `bunx.cmd`/`npx.cmd`), as one command line with every word quoted, so
 * paths with spaces or `&` stay single arguments.
 */
export function spawnSpec(command: string, args: readonly string[], platform: NodeJS.Platform = process.platform): SpawnSpec {
  const [file, ...pre] = splitCommand(command);
  if (!file) throw new Error('tsprose.fmt.command is empty');
  if (platform !== 'win32') return { file, args: [...pre, ...args], shell: false };
  return { file: [file, ...pre, ...args].map(quoteWindowsArg).join(' '), args: [], shell: true };
}

/**
 * Absolute path of the `tsprose.fmt.config` setting: absolute paths as is; relative ones against the workspace
 * folder, or against the document's directory when the document is outside any workspace. Empty: no config.
 */
export function resolveConfigPath(setting: string, workspaceFolder: string | undefined, documentPath: string): string | undefined {
  if (!setting) return undefined;
  if (isAbsolute(setting)) return setting;
  return resolve(workspaceFolder ?? dirname(documentPath), setting);
}
