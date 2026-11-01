import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'analyzer',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'tsprose', development: true },
  },
});
