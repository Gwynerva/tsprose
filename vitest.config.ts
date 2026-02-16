import { defineConfig } from 'vitest/config';

function rel(path: string) {
  return new URL(path, import.meta.url).pathname;
}

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
      include: ['./test/**/*'],
      ignoreSourceErrors: true,
    },
  },
  resolve: {
    alias: {
      '@src': rel('./src/'),
    },
  },
});
