import { defineRefs } from 'tsprose';
import { Statement } from '../../../../../src/tags.js';

export const refs = defineRefs(import.meta.url, { method: Statement });
