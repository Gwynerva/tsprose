import { defineRefs } from 'tsprose';
import { Details, Diagram, Image, Problems, Statement, Term } from '../../../../../src/tags.js';

export const refs = defineRefs(import.meta.url, {
  discriminant: Term,
  formula: Statement,
  _squareRootExample: Details,
  overview: Diagram,
  cover: Image,
  deriveProblems: Problems,
});
