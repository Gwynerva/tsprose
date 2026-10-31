import { defineRefs } from 'tsprose';
import { Statement, Term } from '../../src/tags.js';

export const refs = defineRefs(import.meta.url, { main: Statement, neverUsed: Term });
