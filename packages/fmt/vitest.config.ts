import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'fmt',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'tsprose', development: true } },
});
