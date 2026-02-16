<img src="./.github/assets/banner.svg" alt="TSProse banner">

<p></p>

# TSProse

Write and structure prose content using TypeScript TSX with strong typing.

- Write prose using **TSX** syntax
- Define **your own** element schemas and tags
- Link any elements with **"uniques"** system (e.g. for cross-referencing)
- Convert raw TSX output into a stable, linkable prose tree
- **Storage** system for attaching async/heavy/reusable data to elements

TSProse is a **parser + structurer**: you write content in TSX, TSProse turns it into a typed element tree. Rendering, styling, and analysis are up to you.

## Installation

```bash
npm install tsprose
```

Configure your `tsconfig.json` to use TSProse as the JSX runtime:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tsprose",
  },
}
```

## Core idea

The idea is simple — you define schemas and tags, use tags to write raw prose in TSX, convert raw prose to prose with stable IDs and collected uniques, then do whatever you want with the prose tree (render, analyze, serialize, etc):

1. **Schema** — Describes an element’s shape and rules (block vs inliner, linkable or not, typed data/children).
2. **Tag (TSX)** — The callable you use in TSX files; it creates/configures **raw elements** according to the schema.
3. **RawElement** — The initial, unprocessed elements produced by evaluating your TSX.
4. **ProseElement** (via **`rawToProse`** function) — raw elements are transformed into prose elements via `rawToProse()` which assigns stable IDs to linkable elements and collects uniques.
5. (optional) **Storage** — Attach async/heavy/reusable data to elements (e.g. computed metadata) when needed.
6. **Use the prose tree** — Render, analyze, serialize, etc.

## Get started (minimal example)

This example defines two elements:

- `paragraph` (block, linkable, optional data)
- `bold` (inliner, non-linkable)

```ts
import {
  defineSchema,
  defineTag,
  defineDocument,
  rawToProse,
  ensureTagInlinerChildren,
  ensureTagChildren,
  type BlockSchema,
  type InlinerSchema,
  type TextSchema,
} from 'tsprose';

//
// 1. Schemas
//

interface ParagraphSchema extends BlockSchema {
  name: 'paragraph';
  type: 'block';
  linkable: true;
  Data: { center?: boolean } | undefined;
  Storage: undefined;
  Children: InlinerSchema[];
}

const paragraphSchema = defineSchema<ParagraphSchema>({
  name: 'paragraph',
  type: 'block',
  linkable: true,
});

interface BoldSchema extends InlinerSchema {
  name: 'bold';
  type: 'inliner';
  linkable: false;
  Data: undefined;
  Storage: undefined;
  Children: TextSchema[];
}

const boldSchema = defineSchema<BoldSchema>({
  name: 'bold',
  type: 'inliner',
  linkable: false,
});

//
// 2. Tags
//

const P = defineTag({ tagName: 'P', schema: paragraphSchema })<{ center?: true }>(
  ({ tagName, props, children, element }) => {
    ensureTagInlinerChildren(tagName, children);
    element.children = children;

    if (props.center) {
      element.data = { center: true };
    }
  },
);

const B = defineTag({ tagName: 'B', schema: boldSchema })(({ tagName, children, element }) => {
  // `text` is built-in; strings become text elements automatically.
  ensureTagInlinerChildren(tagName, children);
  element.children = children;
});

//
// 3. Document (TSX)
//

const document = defineDocument('my-document-id', {
  uniques: { intro: P },
})(({ uniques }) => (
  <>
    <P $={uniques.intro} center>
      Hello <B>world</B>
    </P>
  </>
));

//
// 4. Convert to prose (stable IDs + collected uniques)
//

const { prose, uniques } = await rawToProse({ rawProse: document.rawProse });

console.log(prose.schema.name); // "mix" (fragment)
console.log(uniques.intro.id); // "intro"
```

## Next steps

- Walk the tree (`walkPre*` / `walkPost*`) to render/analyze
- Serialize (`toJSON` / `fromJSON`) if you need persistence
- Attach async data via storage (`fillProseStorage`) when you need it

## License

[MIT](./LICENSE)
