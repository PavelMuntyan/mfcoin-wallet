import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { normalizeAssetHistory } = require(join(process.env.MFC_TEST_BUILD, 'asset-history.cjs'));

function entry(status, stage = 'create') {
  return { operation: 'create', stage, status, assetId: 1, fee: '1', maxFee: '2', hash: '0xhash', blockHash: null, timestamp: 1, accountId: '0xabc' };
}

test('finalized create requires an explicit metadata review', () => {
  const [created] = normalizeAssetHistory([entry('finalized')]);
  assert.equal(created.status, 'metadataRequired');
});

test('other asset states are preserved', () => {
  assert.equal(normalizeAssetHistory([entry('pending')])[0].status, 'pending');
  assert.equal(normalizeAssetHistory([entry('finalized', 'metadata')])[0].status, 'finalized');
  assert.equal(normalizeAssetHistory([entry('failed')])[0].status, 'failed');
});
