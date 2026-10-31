import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      name: 'tsprose:registry',
      include: [],
      typecheck: {
        enabled: true,
        include: ['test/registry/**/*.test-d.ts', 'test/registry/**/*.test-d.tsx'],
        tsconfig: './tsconfig.registry.json',
        ignoreSourceErrors: false,
      },
    },
  }),
);
