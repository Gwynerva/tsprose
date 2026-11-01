import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'consumer-test',
    include: ['test/**/*.test.tsx'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.tsx'],
      tsconfig: './tsconfig.json',
      ignoreSourceErrors: false,
    },
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'tsprose', development: true },
  },
});
