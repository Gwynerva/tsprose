// Report mode: how many spaces the TSProse rule would insert in a content tree, without writing.
// Usage: bun scripts/report.ts <dir> [--show]
import { readFile } from 'node:fs/promises';
import { transform } from '../src/transform.js';
import { walkProseFiles } from '../src/tooling.js';

const dir = process.argv[2];
const show = process.argv.includes('--show');
if (!dir) {
  console.error('usage: bun scripts/report.ts <dir> [--show]');
  process.exit(1);
}

let totalFiles = 0;
let touched = 0;
let total = 0;
let textual = 0;
const started = performance.now();
for await (const file of walkProseFiles(dir)) {
  totalFiles++;
  const source = await readFile(file, 'utf8');
  const result = transform(source, file);
  if (result.errors.length) console.log(`! ${file}: ${result.errors[0]}`);
  if (!result.insertions.length) continue;
  touched++;
  total += result.insertions.length;
  const t = result.insertions.filter((i) => i.between === 'text').length;
  textual += t;
  console.log(
    `${result.insertions.length.toString().padStart(4)} (${t.toString().padStart(3)} text)  ${file}`,
  );
  if (show) {
    const lines = source.split(/\r\n|\r|\n/);
    for (const ins of result.insertions
      .filter((i) => i.between === 'text')
      .slice(0, 40)) {
      const before = (lines[ins.line - 2] ?? '').trim();
      const line = lines[ins.line - 1] ?? '';
      console.log(
        `      ${ins.line}:${ins.column}  …${before.slice(-30)} ⏎ ${line.slice(ins.column - 1, ins.column + 40)}`,
      );
    }
  }
}
console.log(
  `\n${total} insertions (${textual} text-adjacent, ${total - textual} between elements) in ${touched}/${totalFiles} files, ${(performance.now() - started).toFixed(0)} ms`,
);
