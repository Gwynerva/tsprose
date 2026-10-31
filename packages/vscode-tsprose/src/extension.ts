import { spawn } from 'node:child_process';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { matchesGlob } from './glob.js';

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
      const glob = config.get<string>('files', '**/content/**/*.tsx');
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      const relative = folder ? vscode.workspace.asRelativePath(document.uri, false) : document.uri.fsPath;
      if (!matchesGlob(relative, glob)) {
        log(`skip ${relative}: does not match tsprose.fmt.files "${glob}"`);
        return [];
      }

      const command = config.get<string>('command', 'bunx tsprose-fmt');
      const configPath = config.get<string>('config', '');
      const args = ['--stdin', '--stdin-filepath', document.uri.fsPath];
      if (configPath && folder) args.push('--config', join(folder.uri.fsPath, configPath));

      const started = Date.now();
      const formatted = await run(command, args, document.getText(), folder?.uri.fsPath, token, output);
      if (formatted === undefined) return [];
      if (formatted === document.getText()) {
        log(`${relative}: already formatted (${Date.now() - started} ms)`);
        return [];
      }
      log(`${relative}: formatted (${Date.now() - started} ms)`);
      const full = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      return [vscode.TextEdit.replace(full, formatted)];
    },
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider([{ language: 'typescriptreact' }, { language: 'javascriptreact' }], provider),
    output,
  );
}

export function deactivate(): void {}

function run(command: string, args: string[], input: string, cwd: string | undefined, token: vscode.CancellationToken, output: vscode.OutputChannel): Promise<string | undefined> {
  return new Promise((resolve) => {
    const [cmd, ...pre] = command.split(/\s+/).filter(Boolean);
    const child = spawn(cmd!, [...pre, ...args], { cwd, shell: process.platform === 'win32' });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    token.onCancellationRequested(() => child.kill());
    child.on('error', (e) => {
      output.appendLine(`tsprose-fmt failed to start: ${e.message}`);
      resolve(undefined);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        output.appendLine(`tsprose-fmt exited with ${code}: ${Buffer.concat(err).toString('utf8')}`);
        resolve(undefined);
        return;
      }
      resolve(Buffer.concat(out).toString('utf8'));
    });
    child.stdin.end(input);
  });
}

