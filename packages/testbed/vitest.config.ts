import { defineConfig } from 'vitest/config';
import tsproseTransform from '@tsprose/transform/vite';

export default defineConfig({
  plugins: [tsproseTransform()],
  test: {
    name: 'testbed',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    testTimeout: 60_000,
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'tsprose', development: true },
  },
});
