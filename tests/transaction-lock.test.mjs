import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const values = new Map();
globalThis.chrome = {
  storage: {
    local: {
      get(key, callback) { callback({ [key]: values.get(key) }); }
    }
  },
  runtime: {}
};

const require = createRequire(import.meta.url);
const { acquireAccountLock, hasPendingTransaction, isAccountActive } = require(join(process.env.MFC_TEST_BUILD, 'transaction-lock.cjs'));

test('account lock is exclusive and reusable after release', () => {
  const release = acquireAccountLock('wallet-1');
  assert.equal(isAccountActive('wallet-1'), true);
  assert.throws(() => acquireAccountLock('wallet-1'), /already being signed/);
  release();
  release();
  assert.equal(isAccountActive('wallet-1'), false);
  assert.doesNotThrow(() => acquireAccountLock('wallet-1')());
});

test('pending detection covers native and asset histories', async () => {
  values.set('mfcoin.history.v1', [{ sender: '0xabc', status: 'pending' }]);
  values.set('mfcoin.assets.history.v1', []);
  assert.equal(await hasPendingTransaction('wallet-1', '0xabc'), true);
  values.set('mfcoin.history.v1', []);
  values.set('mfcoin.assets.history.v1', [{ walletId: 'wallet-1', accountId: '0xabc', status: 'pending' }]);
  assert.equal(await hasPendingTransaction('wallet-1', '0xabc'), true);
  values.set('mfcoin.assets.history.v1', [{ walletId: 'wallet-1', accountId: '0xabc', status: 'metadataRequired' }]);
  assert.equal(await hasPendingTransaction('wallet-1', '0xabc'), false);
});
