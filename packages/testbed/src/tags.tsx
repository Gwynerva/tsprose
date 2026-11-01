// ~40 tags mirroring Erudit's element set, defined with the 2.0 API.
import {
  defineBlock,
  defineInline,
  refSchema,
  s,
  type BlockDef,
  type InlineDef,
  type Tag,
  type DeriveContext,
} from 'tsprose';
import { block, inline, P, textOf } from './kit.js';

export { P };

//
// Inline
//

export const B = inline({
  name: 'bold',
  children: 'inline',
  props: { accent: s.optional(s.boolean()) },
});
export const I = inline({ name: 'italic', children: 'inline' });
export const Br = inline({ name: 'br' });

export const M = inline({
  name: 'inlineMath',
  children: { of: 'inline', max: 1 },
  props: { currentColor: s.optional(s.boolean()) },
  ref: 'optional',
  data: ({ children }) => ({ tex: textOf(children) }),
}).derive(async (node, ctx) => renderMath(node.data.tex, ctx));

export const CaptionSecondary = defineInline({
  name: 'captionSecondary',
  children: 'inline',
});
export const Caption = defineInline({
  name: 'caption',
  children: {
    of: 'inline',
    pattern:
      '(text | bold | italic | inlineMath | dep | ref)+ captionSecondary?',
  },
  props: { width: s.optional(s.string()) },
});

/** Cross reference inline tags: `to` is a ref handle or a URL. */
export const Ref = inline({
  name: 'ref',
  children: 'inline',
  props: { to: s.union(refSchema(), s.string()) },
});
export const Dep = inline({
  name: 'dep',
  children: 'inline',
  props: { on: refSchema() },
});

//
// Blocks
//

export const Heading = block({
  name: 'heading',
  props: { level: s.enum([1, 2, 3]) },
  children: 'inline',
  ref: 'optional',
  data: ({ children }) => ({ text: textOf(children) }),
}).key((node) => node.data.text);
export const H1 = Heading.with({ level: 1 });
export const H2 = Heading.with({ level: 2 });
export const H3 = Heading.with({ level: 3 });

export const Hr = defineBlock({ name: 'hr' });

export const BlockMath = block({
  name: 'blockMath',
  children: { of: 'inline', max: 1 },
  props: { freeze: s.optional(s.boolean()) },
  ref: 'optional',
  data: ({ children }) => ({ tex: textOf(children) }),
}).derive(async (node, ctx) => renderMath(node.data.tex, ctx));

export const Callout = block({
  name: 'callout',
  props: {
    icon: s.string(),
    title: s.string(),
    invert: s.optional(s.boolean()),
  },
  children: 'block',
  ref: 'optional',
}).derive(async (node) => ({ icon: `icons/${node.props.icon}.svg` }));

export const Details = block({
  name: 'details',
  props: { title: s.optional(s.string()) },
  children: 'block',
  ref: 'required',
  common: { toc: false, snippet: false },
});

export const Diagram = block({
  name: 'diagram',
  children: { of: 'inline', pattern: 'text caption?' },
  ref: 'optional',
  data: ({ children }) => ({
    source: textOf(children.filter((c) => c.type === 'text')),
  }),
});

export const Flex = block({
  name: 'flex',
  props: {
    gap: s.optional(s.string()),
    justify: s.optional(s.string()),
    flexes: s.optional(s.array(s.string())),
  },
  children: 'block',
  ref: 'optional',
});

export const Image = block({
  name: 'image',
  props: {
    src: s.string(),
    width: s.optional(s.string()),
    invert: s.optional(s.enum(['dark', 'light'])),
  },
  children: { of: [Caption], min: 0, max: 1 },
  ref: 'optional',
})
  .key((node) => node.props.src.replace(/^.*\//, ''))
  .derive(async (node, ctx) => probeAsset(node.props.src, ctx));

export const Video = block({
  name: 'video',
  props: {
    src: s.string(),
    width: s.optional(s.string()),
    autoplay: s.optional(s.boolean()),
  },
  children: { of: [Caption], min: 0, max: 1 },
  ref: 'optional',
}).derive(async (node, ctx) => probeAsset(node.props.src, ctx));

export const Gallery = block({
  name: 'gallery',
  children: [Image],
  ref: 'optional',
});

export const Li = block({ name: 'listItem', children: 'block' });
export const List = block({
  name: 'list',
  props: { ordered: s.optional(s.boolean()), start: s.optional(s.number()) },
  children: [Li],
  ref: 'optional',
});

export interface TdDef extends BlockDef<
  'tableData',
  {
    center: ReturnType<typeof s.optional<boolean>>;
    hspan: ReturnType<typeof s.optional<number>>;
  },
  'any'
> {}
export const Td: Tag<TdDef> = defineBlock<TdDef>({
  name: 'tableData',
  props: { center: s.optional(s.boolean()), hspan: s.optional(s.number()) },
  children: 'any',
});
export const Tr = defineBlock({ name: 'tableRow', children: [Td] });
export const Table = block({
  name: 'table',
  children: { of: [Tr, Caption], pattern: 'tableRow+ caption?' },
  ref: 'optional',
});

//
// Accents (Statement / Term / Important) — a factory like Erudit's defineAccentCore
//

function defineAccent<
  const Name extends string,
  const Sections extends readonly string[],
>(name: Name, sections: Sections) {
  const Main = block({ name: `${name}Main`, children: 'block' });
  const sectionTags = sections.map((section) =>
    block({
      name: `${name}${capitalize(section)}` as `${Name}${Capitalize<Sections[number]>}`,
      children: 'block',
    }),
  );
  const Section = block({
    name: `${name}Section`,
    props: { title: s.string() },
    children: 'block',
  });
  const Accent = block({
    name,
    props: { title: s.string() },
    children: {
      of: [Main, Section, ...sectionTags, P],
      pattern: `${name}Main (${[`${name}Section`, ...sections.map((x) => `${name}${capitalize(x)}`)].join(' | ')})*`,
    },
    ref: 'required',
  });
  return { Accent, Main, Section, sectionTags };
}

function capitalize<S extends string>(s: S): Capitalize<S> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<S>;
}

const statement = defineAccent('statement', ['proof']);
export const Statement = statement.Accent;
export const StatementMain = statement.Main;
export const StatementSection = statement.Section;
export const StatementProof = statement.sectionTags[0]!;

const term = defineAccent('term', []);
export const Term = term.Accent;
export const TermMain = term.Main;
export const TermSection = term.Section;

const important = defineAccent('important', []);
export const Important = important.Accent;
export const ImportantMain = important.Main;
export const ImportantSection = important.Section;

//
// Problems
//

export const ProblemDescription = block({
  name: 'problemDescription',
  children: 'block',
});
export const ProblemHint = block({ name: 'problemHint', children: 'block' });
export const ProblemNote = block({ name: 'problemNote', children: 'block' });
export const ProblemSolution = block({
  name: 'problemSolution',
  children: 'block',
});
export const ProblemAnswer = block({
  name: 'problemAnswer',
  children: 'block',
});
export const ProblemSection = block({
  name: 'problemSection',
  props: { title: s.string() },
  children: 'block',
});

export interface ProblemCheckDef extends BlockDef<
  'problemCheck',
  {
    label: ReturnType<typeof s.optional<string>>;
    answer: ReturnType<typeof s.optional<string | number>>;
    answers: ReturnType<typeof s.optional<(string | number)[]>>;
  },
  { readonly of: () => readonly Tag<ProblemCheckDef>[]; readonly min: 0 }
> {}
export const ProblemCheck: Tag<ProblemCheckDef> = defineBlock<ProblemCheckDef>({
  name: 'problemCheck',
  props: {
    label: s.optional(s.string()),
    answer: s.optional(s.union(s.string(), s.number())),
    answers: s.optional(s.array(s.union(s.string(), s.number()))),
  },
  children: { of: () => [ProblemCheck], min: 0 },
});

const problemContent = [
  ProblemDescription,
  ProblemHint,
  ProblemNote,
  ProblemSolution,
  ProblemAnswer,
  ProblemSection,
  ProblemCheck,
  P,
  BlockMath,
  Image,
] as const;
const problemPattern =
  'problemDescription (problemHint | problemNote | problemSolution | problemAnswer | problemSection | problemCheck | paragraph | blockMath | image)*';

export const SubProblem = block({
  name: 'subProblem',
  props: { label: s.string() },
  children: { of: problemContent, pattern: problemPattern },
}).derive(async (node) => ({
  checks: node.children.filter((c) => c.type === 'problemCheck').length,
}));

export const Problem = block({
  name: 'problem',
  props: {
    title: s.string(),
    level: s.enum(['easy', 'medium', 'hard', 'example']),
    method: s.optional(s.boolean()),
    pretty: s.optional(s.boolean()),
  },
  children: { of: problemContent, pattern: problemPattern },
  ref: 'required',
}).derive(async (node) => ({
  checks: node.children.filter((c) => c.type === 'problemCheck').length,
}));

export const Problems = block({
  name: 'problems',
  props: {
    title: s.string(),
    level: s.enum(['easy', 'medium', 'hard', 'example']),
  },
  children: { of: [P, SubProblem], pattern: 'paragraph* subProblem+' },
  ref: 'required',
});

//
// Components (plain functions)
//

export const QED = () => <M>{'\\blacksquare'}</M>;

export function MathValueCheck(props: {
  label?: string;
  answer?: number;
  answers?: number[];
}) {
  return (
    <ProblemCheck
      label={props.label ?? 'Value'}
      answer={props.answer}
      answers={props.answers}
    />
  );
}

export function RootsCheck(props: { roots: (number | [number, string])[] }) {
  return (
    <ProblemCheck
      label="Roots"
      answers={props.roots.map((r) => (Array.isArray(r) ? r[1] : r))}
    />
  );
}

//
// Derive helpers (simulate KaTeX rendering and asset probing with small delays)
//

interface TestbedContext {
  readonly delay?: number | undefined;
  readonly assets?:
    Record<string, { width: number; height: number }> | undefined;
}

async function renderMath(
  tex: string,
  ctx: DeriveContext,
): Promise<{ html: string }> {
  const c = ctx.context as TestbedContext | undefined;
  if (c?.delay) await new Promise((r) => setTimeout(r, c.delay));
  return {
    html: `<span class="katex">${tex.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]!)}</span>`,
  };
}

async function probeAsset(
  src: string,
  ctx: DeriveContext,
): Promise<{ width: number; height: number }> {
  const c = ctx.context as TestbedContext | undefined;
  if (c?.delay) await new Promise((r) => setTimeout(r, c.delay));
  return c?.assets?.[src] ?? { width: 800, height: 600 };
}

export const allTags = {
  P,
  B,
  I,
  Br,
  M,
  CaptionSecondary,
  Caption,
  Ref,
  Dep,
  Heading,
  H1,
  H2,
  H3,
  Hr,
  BlockMath,
  Callout,
  Details,
  Diagram,
  Flex,
  Image,
  Video,
  Gallery,
  Li,
  List,
  Td,
  Tr,
  Table,
  Statement,
  StatementMain,
  StatementSection,
  StatementProof,
  Term,
  TermMain,
  TermSection,
  Important,
  ImportantMain,
  ImportantSection,
  ProblemDescription,
  ProblemHint,
  ProblemNote,
  ProblemSolution,
  ProblemAnswer,
  ProblemSection,
  ProblemCheck,
  SubProblem,
  Problem,
  Problems,
};

export type AllTags = typeof allTags;

declare module 'tsprose' {
  interface Registry {
    paragraph: typeof P;
    bold: typeof B;
    italic: typeof I;
    br: typeof Br;
    inlineMath: typeof M;
    captionSecondary: typeof CaptionSecondary;
    caption: typeof Caption;
    ref: typeof Ref;
    dep: typeof Dep;
    heading: typeof Heading;
    hr: typeof Hr;
    blockMath: typeof BlockMath;
    callout: typeof Callout;
    details: typeof Details;
    diagram: typeof Diagram;
    flex: typeof Flex;
    image: typeof Image;
    video: typeof Video;
    gallery: typeof Gallery;
    listItem: typeof Li;
    list: typeof List;
    tableData: typeof Td;
    tableRow: typeof Tr;
    table: typeof Table;
    statement: typeof Statement;
    statementMain: typeof StatementMain;
    statementSection: typeof StatementSection;
    statementProof: typeof StatementProof;
    term: typeof Term;
    termMain: typeof TermMain;
    termSection: typeof TermSection;
    important: typeof Important;
    importantMain: typeof ImportantMain;
    importantSection: typeof ImportantSection;
    problemDescription: typeof ProblemDescription;
    problemHint: typeof ProblemHint;
    problemNote: typeof ProblemNote;
    problemSolution: typeof ProblemSolution;
    problemAnswer: typeof ProblemAnswer;
    problemSection: typeof ProblemSection;
    problemCheck: typeof ProblemCheck;
    subProblem: typeof SubProblem;
    problem: typeof Problem;
    problems: typeof Problems;
  }
}
