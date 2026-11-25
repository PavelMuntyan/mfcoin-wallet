import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
const rpcUrl = process.env.MFCOIN_RPC_URL || 'wss://mf.life/ws';
const explorerUrl = process.env.MFCOIN_EXPLORER_URL || '';
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const define = {
  'process.env.MFCOIN_WALLET_VERSION': JSON.stringify(packageVersion),
  'process.env.MFCOIN_RPC_URL': JSON.stringify(rpcUrl),
  'process.env.MFCOIN_GENESIS_HASH': JSON.stringify(process.env.MFCOIN_GENESIS_HASH || ''),
  'process.env.MFCOIN_FINALITY_TIMEOUT_MS': JSON.stringify(process.env.MFCOIN_FINALITY_TIMEOUT_MS || ''),
  'process.env.MFCOIN_LOCK_TIMEOUT_MS': JSON.stringify(process.env.MFCOIN_LOCK_TIMEOUT_MS || ''),
  'process.env.MFCOIN_EXPLORER_URL': JSON.stringify(explorerUrl)
};

rmSync('build', { force: true, recursive: true });
mkdirSync('build', { recursive: true });
cpSync('public', 'build', { recursive: true });

const localOrigins = [rpcUrl, explorerUrl]
  .filter((url) => /^(?:wss?|https?):\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(url))
  .map((url) => new URL(url).origin);
if (localOrigins.length) {
  const manifestPath = 'build/manifest.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = [...new Set(localOrigins.map((origin) => `${origin}/*`))];
  manifest.content_security_policy.extension_pages += ` ${[...new Set(localOrigins)].join(' ')}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

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


rmSync('dist-web', { force: true, recursive: true });
mkdirSync('dist-web', { recursive: true });
cpSync('public', 'dist-web', { recursive: true });
rmSync('dist-web/manifest.json', { force: true });
writeFileSync('dist-web/service-worker.js', readFileSync('dist-web/service-worker.js', 'utf8').replace(/mfcoin-wallet-[\d.]+/, `mfcoin-wallet-${packageVersion}`));

await build({
  entryPoints: ['src/web.ts'],
  outfile: 'dist-web/index.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome111'],
  define,
  minify: production,
  sourcemap: !production,
  logLevel: 'info'
});
