// Bun preload: every .tsx the testbed imports goes through the TSProse whitespace rule.
import { plugin } from 'bun';
import { tsproseBun } from '@tsprose/transform/bun';

plugin(tsproseBun());
