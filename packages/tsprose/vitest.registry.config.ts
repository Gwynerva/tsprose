import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

// Type tests that need the global `Registry` / `CorpusRegistry` augmentation, in their own TS project.
export default defineConfig({
  resolve: base.resolve,
  oxc: base.oxc,
  test: {
    name: 'tsprose:registry',
    include: [],
    passWithNoTests: true,
    typecheck: {
      enabled: true,
      include: [
        'test/registry/**/*.test-d.ts',
        'test/registry/**/*.test-d.tsx',
      ],
      tsconfig: './tsconfig.registry.json',
      ignoreSourceErrors: false,
    },
  },
});
