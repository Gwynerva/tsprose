// Formatting benchmark on a real file. Usage: bun test/bench.ts <file.tsx> [--config tsprose.config.ts]
import { existsSync, readFileSync } from 'node:fs';
import { loadFmtConfig } from '../src/config.js';
import { format, type FormatOptions } from '../src/format.js';

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configPath = configIndex === -1 ? undefined : args[configIndex + 1];
const file = args.find(
  (a, i) =>
    !a.startsWith('--') && (configIndex === -1 || i !== configIndex + 1),
);
if (!file || (configIndex !== -1 && !configPath)) {
  console.error(
    'usage: bun test/bench.ts <file.tsx> [--config tsprose.config.ts]',
  );
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`no such file: ${file}`);
  process.exit(2);
}
const source = readFileSync(file, 'utf8');
// The prose pass only (no preFormat): that is what this benchmark measures.
const options: FormatOptions = configPath
  ? (await loadFmtConfig(configPath)).options
  : {};
const width = options.printWidth ?? 120;

let result = format(source, file, options); // warm up
const runs = 20;
const t0 = performance.now();
for (let i = 0; i < runs; i++) result = format(source, file, options);
const per = (performance.now() - t0) / runs;
const second = format(result.code, file, options);
const over = (s: string) =>
  s.split('\n').filter((l) => l.length > width).length;
console.log(file);
console.log(
  `${source.split('\n').length} lines, ${(source.length / 1024).toFixed(0)} KB`,
);
console.log(
  `format: ${per.toFixed(1)} ms per run (warm, ${runs} runs); changed: ${result.changed}; idempotent: ${!second.changed}; errors: ${result.errors.length}`,
);
console.log(
  `lines over ${width} chars: ${over(source)} before, ${over(result.code)} after`,
);
