// Formatting benchmark on real content. Usage: bun test/bench.ts [file]
import { readFileSync, existsSync } from 'node:fs';
import { format } from '../src/format.js';
import { kindOfFromLists } from '../src/kinds.js';

const file = process.argv[2] ?? 'E:/code/open-math/new.omath.ru/content/01-foundations/02-equations/01-elementary/practice.tsx';
if (!existsSync(file)) {
  console.error(`no such file: ${file}`);
  process.exit(1);
}
const source = readFileSync(file, 'utf8');
const kindOf = kindOfFromLists(
  ['M', 'B', 'I', 'Br', 'Dep', 'Ref', 'Caption', 'CaptionSecondary', 'Td', 'Tr', 'QED'],
  [
    'P', 'H1', 'H2', 'H3', 'BlockMath', 'Problems', 'Problem', 'SubProblem', 'ProblemDescription', 'ProblemHint',
    'ProblemAnswer', 'ProblemSolution', 'ProblemSection', 'ProblemNote', 'ProblemCheck', 'List', 'Li', 'Table', 'Image',
    'Video', 'Details', 'Callout', 'Diagram', 'Flex', 'Gallery', 'Hr', 'Statement', 'StatementMain', 'StatementProof',
    'StatementSection', 'Term', 'Important', 'Include', 'Reference', 'Dependency', 'MathValueCheck',
    'MathExpressionCheck', 'MathEqualityCheck', 'RootsCheck',
  ],
);
const options = { printWidth: 120, kindOf };

let result = format(source, file, options); // warm up
const runs = 20;
const t0 = performance.now();
for (let i = 0; i < runs; i++) result = format(source, file, options);
const per = (performance.now() - t0) / runs;
const second = format(result.code, file, options);
const over = (s: string) => s.split('\n').filter((l) => l.length > 120).length;
console.log(file);
console.log(`${source.split('\n').length} lines, ${(source.length / 1024).toFixed(0)} KB`);
console.log(`format: ${per.toFixed(1)} ms per run (warm, ${runs} runs); changed: ${result.changed}; idempotent: ${!second.changed}; errors: ${result.errors.length}`);
console.log(`lines over 120 chars: ${over(source)} before, ${over(result.code)} after`);
