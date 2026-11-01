import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'vscode-tsprose', include: ['test/**/*.test.ts'] },
});
