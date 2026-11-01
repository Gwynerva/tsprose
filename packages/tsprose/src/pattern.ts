import { TAG_NAME_SOURCE } from './util.js';
/**
 * Content model patterns — a tiny DTD-like grammar over child type names.
 *
 *   'paragraph+ proof?'      one or more paragraphs followed by an optional proof
 *   'main section*'          exactly one main, then any number of sections
 *   '(text | caption){1,2}'  not supported: use `min`/`max` on the children rule instead
 *
 * Grammar: sequence of items; item = name | '(' alternatives ')' followed by an optional
 * quantifier `?`, `*`, `+`; alternatives = sequence ('|' sequence)*.
 * Names match `node.type` (letters, digits, `_`, `-`, `.`).
 */
export interface CompiledPattern {
  readonly source: string;
  /** All type names mentioned by the pattern. */
  readonly names: ReadonlySet<string>;
  test(types: readonly string[]): boolean;
}

type Token =
  | { kind: 'name'; value: string }
  | { kind: '(' }
  | { kind: ')' }
  | { kind: '|' }
  | { kind: 'q'; value: '?' | '*' | '+' };

const NAME_RE = new RegExp(`^${TAG_NAME_SOURCE}`);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '|') {
      tokens.push({ kind: ch });
      i++;
      continue;
    }
    if (ch === '?' || ch === '*' || ch === '+') {
      tokens.push({ kind: 'q', value: ch });
      i++;
      continue;
    }
    const m = NAME_RE.exec(src.slice(i));
    if (!m) {
      throw new SyntaxError(
        `Invalid children pattern "${src}": unexpected character "${ch}" at ${i}`,
      );
    }
    tokens.push({ kind: 'name', value: m[0] });
    i += m[0].length;
  }
  return tokens;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile a pattern string into a matcher. Throws SyntaxError on malformed patterns. */
export function compilePattern(source: string): CompiledPattern {
  const tokens = tokenize(source);
  const names = new Set<string>();
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseAlternatives(): string {
    const branches = [parseSequence()];
    while (peek()?.kind === '|') {
      next();
      branches.push(parseSequence());
    }
    return branches.length === 1 ? branches[0]! : `(?:${branches.join('|')})`;
  }

  function parseSequence(): string {
    let out = '';
    while (true) {
      const t = peek();
      if (!t || t.kind === ')' || t.kind === '|') break;
      out += parseItem();
    }
    return out;
  }

  function parseItem(): string {
    const t = next();
    let atom: string;
    if (!t)
      throw new SyntaxError(
        `Invalid children pattern "${source}": unexpected end`,
      );
    if (t.kind === 'name') {
      names.add(t.value);
      atom = `(?:${escapeRe(t.value)},)`;
    } else if (t.kind === '(') {
      const inner = parseAlternatives();
      const close = next();
      if (!close || close.kind !== ')') {
        throw new SyntaxError(
          `Invalid children pattern "${source}": missing ")"`,
        );
      }
      atom = `(?:${inner})`;
    } else {
      throw new SyntaxError(
        `Invalid children pattern "${source}": unexpected "${t.kind === 'q' ? t.value : t.kind}"`,
      );
    }
    const q = peek();
    if (q && q.kind === 'q') {
      next();
      atom += q.value;
    }
    return atom;
  }

  const body = parseAlternatives();
  if (pos !== tokens.length) {
    throw new SyntaxError(
      `Invalid children pattern "${source}": unexpected ")"`,
    );
  }
  if (names.size === 0) {
    throw new SyntaxError(
      `Invalid children pattern "${source}": empty pattern`,
    );
  }
  const re = new RegExp(`^${body}$`);
  return {
    source,
    names,
    test(types) {
      return re.test(types.map((t) => `${t},`).join(''));
    },
  };
}
