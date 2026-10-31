import type { B, Heading, I, Image, Item, P, Proof, Qed, Sec, Theorem, Em, M, Table, Tr, Td } from '../fixtures/tags.js';

declare module 'tsprose' {
  interface Registry {
    bold: typeof B;
    italic: typeof I;
    math: typeof M;
    paragraph: typeof P;
    qed: typeof Qed;
    image: typeof Image;
    proof: typeof Proof;
    theorem: typeof Theorem;
    heading: typeof Heading;
    section: typeof Sec;
    item: typeof Item;
    em: typeof Em;
    table: typeof Table;
    tr: typeof Tr;
    td: typeof Td;
  }
}

declare module 'tsprose' {
  interface CorpusRegistry {
    'dem/1': { statement: 'problem'; solution: 'solution' };
    'ref/lagrange': { lagrange: 'theorem'; note: 'paragraph' };
    'section/limits': {};
  }
}
