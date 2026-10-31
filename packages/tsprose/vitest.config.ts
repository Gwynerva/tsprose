import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tsprose',
    include: ['test/runtime/**/*.test.ts', 'test/runtime/**/*.test.tsx'],
    typecheck: {
      enabled: true,
      include: ['test/types/**/*.test-d.ts', 'test/types/**/*.test-d.tsx'],
      tsconfig: './tsconfig.json',
      ignoreSourceErrors: false,
    },
  },
  resolve: {
    alias: {
      'tsprose/jsx-dev-runtime': new URL('./src/jsx-dev-runtime.ts', import.meta.url).pathname,
      'tsprose/jsx-runtime': new URL('./src/jsx-runtime.ts', import.meta.url).pathname,
      'tsprose/internal': new URL('./src/internal.ts', import.meta.url).pathname,
      tsprose: new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'tsprose', development: true } },
});
