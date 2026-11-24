import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { reconciliationExpired, reconciliationScanUntil } = require(join(process.env.MFC_TEST_BUILD, 'reconcile.cjs'));

test('reconcile is capped by mortal lifetime after a long service-worker pause', () => {
  const finalized = 100_064;
  const expiresAfter = 64;
  const lastChecked = 0;
  const scanUntil = reconciliationScanUntil(finalized, expiresAfter);
  assert.equal(scanUntil, 64);
  assert.equal(scanUntil - lastChecked, 64);
  assert.equal(reconciliationExpired(finalized, expiresAfter), true);
});

test('reconcile does not drop a live transaction and supports immortals', () => {
  assert.equal(reconciliationScanUntil(100, 64), 64);
  assert.equal(reconciliationExpired(64, 64), false);
  assert.equal(reconciliationScanUntil(100_000), 100_000);
  assert.equal(reconciliationExpired(100_000), false);
});
