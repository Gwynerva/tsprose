import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { resolveConfigPath, spawnSpec } from './command.js';

const DEFAULT_FILES = '**/content/**/*.tsx';

/**
 * Registers a document formatter for prose files. The heavy lifting is `tsprose-fmt --stdin`;
 * the formatter runs in well under 50 ms on 3k-line articles, so a process per request is fine.
 * Set `editor.defaultFormatter` to `tsprose.vscode-tsprose` for `[typescriptreact]` in the workspace
 * that holds the prose, or rely on the `tsprose.fmt.files` glob (non-matching files get no edits).
 */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('TSProse');
  output.appendLine(`TSProse formatter active (${context.extension.packageJSON.version as string}).`);
  const log = (message: string) => output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document, _options, token) {
      const config = vscode.workspace.getConfiguration('tsprose.fmt', document.uri);
      const glob = config.get<string>('files', DEFAULT_FILES);
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      const relative = folder ? vscode.workspace.asRelativePath(document.uri, false) : document.uri.fsPath;
      // VS Code's own glob engine: relative to the workspace folder, or against the whole path outside one.
      const pattern = folder ? new vscode.RelativePattern(folder, glob) : glob;
      if (vscode.languages.match({ pattern }, document) === 0) {
        log(`skip ${relative}: does not match tsprose.fmt.files "${glob}"`);
        return [];
      }

      const command = config.get<string>('command', 'bunx tsprose-fmt');
      const configPath = resolveConfigPath(config.get<string>('config', ''), folder?.uri.fsPath, document.uri.fsPath);
      const args = ['--stdin', '--stdin-filepath', document.uri.fsPath];
      if (configPath) args.push('--config', configPath);

      const started = Date.now();
      const text = document.getText();
      const formatted = await run(command, args, text, folder?.uri.fsPath, token, output);
      if (formatted === undefined || token.isCancellationRequested) return [];
      if (formatted === text) {
        log(`${relative}: already formatted (${Date.now() - started} ms)`);
        return [];
      }
      log(`${relative}: formatted (${Date.now() - started} ms)`);
      const full = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
      return [vscode.TextEdit.replace(full, formatted)];
    },
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider([{ language: 'typescriptreact' }, { language: 'javascriptreact' }], provider),
    output,
  );
}

export function deactivate(): void {}

function run(
  command: string,
  args: string[],
  input: string,
  cwd: string | undefined,
  token: vscode.CancellationToken,
  output: vscode.OutputChannel,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let spec;
    try {
      spec = spawnSpec(command, args);
    } catch (error) {
      output.appendLine(`tsprose-fmt: ${(error as Error).message}`);
      resolve(undefined);
      return;
    }
    const child = spawn(spec.file, spec.args, { cwd, shell: spec.shell, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const cancellation = token.onCancellationRequested(() => child.kill());
    const finish = (value: string | undefined) => {
      cancellation.dispose();
      resolve(value);
    };
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', (e) => {
      output.appendLine(`tsprose-fmt failed to start: ${e.message}`);
      finish(undefined);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        output.appendLine(`tsprose-fmt exited with ${code}: ${Buffer.concat(err).toString('utf8')}`);
        finish(undefined);
        return;
      }
      finish(Buffer.concat(out).toString('utf8'));
    });
    child.stdin.on('error', () => {}); // the process may exit before reading everything (reported on close)
    child.stdin.end(input);
  });
}
