import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { validateAssetBalances, validateHistoryPage } = require(join(process.env.MFC_TEST_BUILD, 'explorer-validation.cjs'));
const { formatAsset, formatMfc } = require(join(process.env.MFC_TEST_BUILD, 'format.cjs'));
const hash = `0x${'11'.repeat(32)}`;
const account = `0x${'22'.repeat(32)}`;

function history() {
  return {
    balanceEvents: [{ id: '1', blockNumber: 1, blockHash: hash, extrinsicHash: hash, kind: 'transfer', fromAccount: account, toAccount: account, amount: '1', fee: '0', timestamp: new Date(0).toISOString() }],
    nextCursor: null,
    previousCursor: '1',
    hasOlder: false,
    hasNewer: false
  };
}

test('valid Explorer history is accepted', () => {
  assert.equal(validateHistoryPage(history()).balanceEvents.length, 1);
  assert.throws(() => validateHistoryPage({ ...history(), balanceEvents: [{ ...history().balanceEvents[0], amount: 'not-a-number' }] }), /amount/);
});

test('asset responses reject dangerous decimals and invalid amounts', () => {
  const response = {
    assets: [{ assetId: 1, name: 'Token', symbol: 'TKN', decimals: 18, owner: account, admin: account, supply: '1', minBalance: '1', destroyed: false, balance: '1' }],
    supported: true,
    truncated: false
  };
  assert.equal(validateAssetBalances(response).assets.length, 1);
  assert.throws(() => validateAssetBalances({ ...response, assets: [{ ...response.assets[0], decimals: 1e9 }] }), /decimals/);
  assert.throws(() => validateAssetBalances({ ...response, assets: [{ ...response.assets[0], balance: '1e9' }] }), /balance/);
  assert.equal(formatAsset('1', 1e9, 'TKN'), 'Unsupported asset');
  assert.equal(formatMfc('not-a-number'), 'Invalid amount');
});
