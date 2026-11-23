import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
const define = {
  'process.env.MFCOIN_RPC_URL': JSON.stringify(process.env.MFCOIN_RPC_URL || ''),
  'process.env.MFCOIN_GENESIS_HASH': JSON.stringify(process.env.MFCOIN_GENESIS_HASH || '')
};

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
    define,
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
    define,
    minify: production,
    sourcemap: !production,
    logLevel: 'info'
  })
]);
