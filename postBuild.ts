import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const srcDir = 'src';
const distDir = 'dist';

async function collectDts(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDts(full)));
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

const dtsFiles = await collectDts(srcDir);

for (const file of dtsFiles) {
  const dest = join(distDir, file.slice(srcDir.length + 1));
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(file, dest);
  console.log(`Copied dts file: ${file} -> ${dest}`);
}
