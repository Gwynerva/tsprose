// Deterministic synthetic corpus generator built from Open-Math-like fragments.
// Usage: bun bench/generate.ts --scale 10 [--out generated/10x]
// scale 1 ≈ Open Math (32 documents, ~27k lines).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const scale = Number(args[args.indexOf('--scale') + 1] || 1);
const out = args.includes('--out')
  ? args[args.indexOf('--out') + 1]!
  : join(import.meta.dirname, '..', 'generated', `${scale}x`);

let seed = 1337 + scale;
const rnd = () =>
  (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const words =
  'уравнение корень число множитель равенство переменная коэффициент дискриминант формула квадрат сумма произведение решение преобразование тождество неизвестное скобка знак пример задача'.split(
    ' ',
  );
const sentence = (n = int(6, 16)) => {
  const ws = Array.from({ length: n }, () => pick(words));
  ws[0] = ws[0]![0]!.toUpperCase() + ws[0]!.slice(1);
  return ws.join(' ') + pick(['.', '.', '.', '!', '?']);
};
const tex = () =>
  pick([
    'x^2 + 2x + 1 = 0',
    '\\frac{-B \\pm \\sqrt{D}}{2A}',
    'D = B^2 - 4AC',
    '(x - 1)(x + 3) = 0',
    'x_1 + x_2 = -\\frac{B}{A}',
    'a^2 - b^2 = (a-b)(a+b)',
  ]);

function inlineText(lines = int(1, 3)): string {
  return Array.from({ length: lines }, () => {
    const parts = [sentence()];
    if (rnd() < 0.6)
      parts.push(`Число <M>{math\`${tex()}\`}</M> ${sentence(5)}`);
    if (rnd() < 0.3) parts.push(`<B>${pick(words)}</B> ${sentence(4)}`);
    if (rnd() < 0.25)
      parts.push(
        `Смотрите <Dep on={shared.method}>правило</Dep> и <Ref to={refs.main}>утверждение</Ref>.`,
      );
    return parts.join(' ');
  }).join('\n          ');
}

const paragraph = (indent: string) =>
  `${indent}<P>\n${indent}  ${inlineText()}\n${indent}</P>`;
const blockMath = (indent: string) =>
  `${indent}<BlockMath>{math\`${tex()}\`}</BlockMath>`;

function statement(indent: string, i: number): string {
  return `${indent}<Statement $={refs.s${i}} title="Утверждение ${i}" snippet={{ key: true, search: true }}>
${indent}  <StatementMain>
${paragraph(indent + '    ')}
${blockMath(indent + '    ')}
${indent}  </StatementMain>
${indent}  <StatementProof>
${paragraph(indent + '    ')}
${indent}    <Details $={refs.d${i}} title="Почему?">
${paragraph(indent + '      ')}
${indent}    </Details>
${indent}    <P>${sentence(5)} <QED /></P>
${indent}  </StatementProof>
${indent}</Statement>`;
}

function problems(indent: string, i: number): string {
  const subs = Array.from(
    { length: int(2, 5) },
    (_, k) => `${indent}  <SubProblem label="Подзадача ${k + 1}">
${indent}    <ProblemDescription>
${paragraph(indent + '      ')}
${blockMath(indent + '      ')}
${indent}    </ProblemDescription>
${indent}    <MathValueCheck label="Ответ" answers={[${int(-9, 9)}, ${int(-9, 9)}]} />
${indent}    <ProblemHint>${sentence(6)}</ProblemHint>
${indent}    <ProblemAnswer><M>${int(-9, 9)}</M> и <M>${int(-9, 9)}</M></ProblemAnswer>
${indent}    <ProblemSolution>
${paragraph(indent + '      ')}
${indent}      <ProblemSection title="Шаг">
${paragraph(indent + '        ')}
${indent}      </ProblemSection>
${indent}    </ProblemSolution>
${indent}  </SubProblem>`,
  ).join('\n');
  return `${indent}<Problems $={refs.p${i}} title="Задачи ${i}" level="${pick(['easy', 'medium', 'hard'])}">
${indent}  <P>${sentence(6)}</P>
${subs}
${indent}</Problems>`;
}

function table(indent: string): string {
  const rows = Array.from(
    { length: int(2, 4) },
    () =>
      `${indent}  <Tr><Td center><M>{math\`${tex()}\`}</M></Td><Td>${sentence(4)}</Td></Tr>`,
  ).join('\n');
  return `${indent}<Table toc="Таблица">\n${rows}\n${indent}</Table>`;
}

function document(
  kind: 'article' | 'practice' | 'summary',
  sizes: { statements: number; problems: number; sections: number },
): { refs: string[]; code: string } {
  const refs: string[] = ['main'];
  const parts: string[] = [
    `      <H1>${kind === 'article' ? 'Статья' : kind === 'practice' ? 'Практика' : 'Сводка'} ${sentence(3)}</H1>`,
  ];
  let s = 0;
  let p = 0;
  for (let sec = 0; sec < sizes.sections; sec++) {
    parts.push(`\n      <H2>Раздел ${sec + 1}</H2>`);
    parts.push(paragraph('      '));
    if (rnd() < 0.5) parts.push(blockMath('      '));
    if (rnd() < 0.3)
      (parts.push(
        `      <Image $={refs.i${sec}} src="assets/figure-${sec}.svg" width="500px"><Caption>${sentence(4)}</Caption></Image>`,
      ),
        refs.push(`i${sec}`));
    if (rnd() < 0.2) parts.push(table('      '));
    if (rnd() < 0.3)
      parts.push(
        `      <List>\n        <Li>${sentence(5)}</Li>\n        <Li><P>${sentence(5)}</P></Li>\n      </List>`,
      );
    if (rnd() < 0.2)
      parts.push(
        `      <Callout icon="info" title="Заметка">\n${paragraph('        ')}\n      </Callout>`,
      );
    for (
      let k = 0;
      k < sizes.statements && s < sizes.statements * sizes.sections;
      k++, s++
    ) {
      parts.push(statement('      ', s));
      refs.push(`s${s}`, `d${s}`);
    }
    for (
      let k = 0;
      k < sizes.problems && p < sizes.problems * sizes.sections;
      k++, p++
    ) {
      parts.push(problems('      ', p));
      refs.push(`p${p}`);
    }
  }
  parts[0] = `      <H1 $={refs.main}>${kind} ${sentence(3)}</H1>`;
  const code = `import { defineDocument } from 'tsprose';
import {
  B, BlockMath, Callout, Caption, Dep, Details, H1, H2, Image, Li, List, M, P, Problems, ProblemAnswer, ProblemDescription,
  ProblemHint, ProblemSection, ProblemSolution, Ref, Statement, StatementMain, StatementProof, SubProblem, Table, Td, Tr,
  QED, MathValueCheck,
} from '../../../src/tags.js';
import { refs } from './refs.js';
import { refs as shared } from '../00-shared/refs.js';

const math = String.raw;

export default defineDocument(
  () => (
    <>
${parts.join('\n')}
    </>
  ),
  { refs },
);
`;
  return { refs, code };
}

function refsModule(names: string[], kinds: Map<string, string>): string {
  const lines = names
    .map((n) => `  ${n}: ${kinds.get(n[0]!) ?? 'P'},`)
    .join('\n');
  return `import { defineRefs } from 'tsprose';
import { Details, Heading, Image, Problems, Statement } from '../../../src/tags.js';

export const refs = defineRefs(import.meta.url, {
${lines}
});
`;
}

const kinds = new Map([
  ['m', 'Heading'],
  ['s', 'Statement'],
  ['d', 'Details'],
  ['p', 'Problems'],
  ['i', 'Image'],
]);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// shared document every topic depends on
await mkdir(join(out, '00-shared'), { recursive: true });
await writeFile(
  join(out, '00-shared', 'refs.ts'),
  `import { defineRefs } from 'tsprose';\nimport { Statement } from '../../../src/tags.js';\n\nexport const refs = defineRefs(import.meta.url, { method: Statement });\n`,
);
await writeFile(
  join(out, '00-shared', 'article.tsx'),
  `import { defineDocument } from 'tsprose';\nimport { BlockMath, H1, P, Statement, StatementMain } from '../../../src/tags.js';\nimport { refs } from './refs.js';\n\nexport default defineDocument(() => (\n  <>\n    <H1>Общее правило</H1>\n    <Statement $={refs.method} title="Правило одинакового действия">\n      <StatementMain>\n        <P>К обеим частям уравнения можно применить одно и то же действие.</P>\n        <BlockMath>{String.raw\`a = b \\Rightarrow a + c = b + c\`}</BlockMath>\n      </StatementMain>\n    </Statement>\n  </>\n), { refs });\n`,
);

const topics = Math.max(1, Math.round(10 * scale)); // 10 topics × 3 documents ≈ 30 docs per scale unit
let files = 0;
let lines = 0;
for (let t = 0; t < topics; t++) {
  const dir = join(out, `${String(t + 1).padStart(2, '0')}-topic-${t + 1}`);
  await mkdir(dir, { recursive: true });
  const docs = {
    article: document('article', {
      statements: 2,
      problems: 1,
      sections: int(4, 7),
    }),
    practice: document('practice', {
      statements: 0,
      problems: 3,
      sections: int(4, 8),
    }),
    summary: document('summary', {
      statements: 1,
      problems: 0,
      sections: int(2, 3),
    }),
  };
  const allRefs = new Map<string, string>();
  for (const [kind, d] of Object.entries(docs)) {
    // each document gets its own refs module named by kind
    const refsCode = refsModule(d.refs, kinds).replace(
      "from './refs.js'",
      `from './${kind}.refs.js'`,
    );
    await writeFile(join(dir, `${kind}.refs.ts`), refsCode);
    const code = d.code.replace(
      "import { refs } from './refs.js';",
      `import { refs } from './${kind}.refs.js';`,
    );
    await writeFile(join(dir, `${kind}.tsx`), code);
    files += 2;
    lines += code.split('\n').length;
    allRefs.set(kind, d.refs.join(','));
  }
}
console.log(
  `generated ${topics} topics, ${files} files, ${lines} lines of prose in ${out}`,
);
