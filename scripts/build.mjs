import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';

rmSync('build', { force: true, recursive: true });
mkdirSync('build', { recursive: true });
cpSync('public', 'build', { recursive: true });

await Promise.all([
  build({
    entryPoints: ['src/index.tsx'],
    outfile: 'build/index.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome111'],
    minify: production,
    sourcemap: !production,
    logLevel: 'info'
  }),
  build({
    entryPoints: ['src/background.ts'],
    outfile: 'build/background.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome111'],
    minify: production,
    sourcemap: !production,
    logLevel: 'info'
  })
]);
