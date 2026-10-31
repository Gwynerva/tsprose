// Cross-platform package build: `node ../../scripts/build-package.mjs [--copy src/a.d.ts ...] [--tsconfig file]`.
// Cleans dist, runs tsc with the package's build tsconfig and copies extra files (e.g. ambient .d.ts) into dist.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const copies = [];
let tsconfig = 'tsconfig.build.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--copy') copies.push(args[++i]);
  else if (args[i] === '--tsconfig') tsconfig = args[++i];
  else throw new Error(`build-package: unknown argument ${args[i]}`);
}

rmSync('dist', { recursive: true, force: true });
execSync(`tsc -p ${JSON.stringify(tsconfig)}`, { stdio: 'inherit' });
mkdirSync('dist', { recursive: true });
for (const file of copies) copyFileSync(file, join('dist', basename(file)));
