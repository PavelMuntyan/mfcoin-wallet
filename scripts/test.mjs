import { build } from 'esbuild';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = mkdtempSync(join(tmpdir(), 'mfcoin-wallet-tests-'));
try {
  await build({
    entryPoints: [
      'src/background/reconcile.ts',
      'src/background/transaction-lock.ts',
      'src/background/explorer-validation.ts',
      'src/background/asset-history.ts',
      'src/ui/format.ts'
    ],
    outdir: output,
    entryNames: '[name]',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    target: ['node20'],
    logLevel: 'error'
  });
  const tests = readdirSync('tests').filter((file) => file.endsWith('.test.mjs')).map((file) => join('tests', file));
  const result = spawnSync(process.execPath, ['--test', ...tests], {
    env: { ...process.env, MFC_TEST_BUILD: output },
    stdio: 'inherit'
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
