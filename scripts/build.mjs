import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
const network = process.env.MFCOIN_NETWORK || 'testnet';
if (!['testnet', 'mainnet'].includes(network)) throw new Error('MFCOIN_NETWORK must be testnet or mainnet');
const rpcUrl = process.env.MFCOIN_RPC_URL || 'wss://mf.life/ws';
const explorerUrl = process.env.MFCOIN_EXPLORER_URL || '';
const explorerWebUrl = process.env.MFCOIN_EXPLORER_WEB_URL || '';
if (network === 'mainnet') {
  for (const [name, value] of Object.entries({ MFCOIN_RPC_URL: rpcUrl, MFCOIN_EXPLORER_URL: explorerUrl, MFCOIN_EXPLORER_WEB_URL: explorerWebUrl })) {
    if (!value) throw new Error(`${name} is required for a Main Net build`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.MFCOIN_GENESIS_HASH || '')) throw new Error('MFCOIN_GENESIS_HASH is required for a Main Net build');
}
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const define = {
  'process.env.MFCOIN_WALLET_VERSION': JSON.stringify(packageVersion),
  'process.env.MFCOIN_NETWORK': JSON.stringify(network),
  'process.env.MFCOIN_RPC_URL': JSON.stringify(rpcUrl),
  'process.env.MFCOIN_GENESIS_HASH': JSON.stringify(process.env.MFCOIN_GENESIS_HASH || ''),
  'process.env.MFCOIN_FINALITY_TIMEOUT_MS': JSON.stringify(process.env.MFCOIN_FINALITY_TIMEOUT_MS || ''),
  'process.env.MFCOIN_LOCK_TIMEOUT_MS': JSON.stringify(process.env.MFCOIN_LOCK_TIMEOUT_MS || ''),
  'process.env.MFCOIN_EXPLORER_URL': JSON.stringify(explorerUrl),
  'process.env.MFCOIN_EXPLORER_WEB_URL': JSON.stringify(explorerWebUrl)
};

rmSync('build', { force: true, recursive: true });
mkdirSync('build', { recursive: true });
cpSync('public', 'build', { recursive: true });

const localOrigins = [rpcUrl, explorerUrl]
  .filter((url) => /^(?:wss?|https?):\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(url))
  .map((url) => new URL(url).origin);
const connectOrigins = [...new Set([rpcUrl, explorerUrl || 'https://mf.life/api/explorer'].map((url) => new URL(url).origin))];
const manifestPath = 'build/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (network === 'mainnet') manifest.name = 'MFCoin Wallet Main Net';
if (localOrigins.length) manifest.host_permissions = [...new Set(localOrigins.map((origin) => `${origin}/*`))];
manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace(/connect-src [^;]+/, `connect-src 'self' ${connectOrigins.join(' ')}`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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

for (const documentPath of ['build/index.html', 'build/sidepanel.html', 'dist-web/index.html']) {
  const document = readFileSync(documentPath, 'utf8').replace(/connect-src [^;]+/, `connect-src 'self' ${connectOrigins.join(' ')}`);
  writeFileSync(documentPath, document);
}

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
