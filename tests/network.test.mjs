import test from 'node:test';
import assert from 'node:assert/strict';

const network = await import(`${process.env.MFC_TEST_BUILD}/network.cjs`);

test('default build preserves Testnet labels and storage keys', () => {
  assert.equal(network.WALLET_NETWORK, 'testnet');
  assert.equal(network.NETWORK_LABEL, 'Testnet 115');
  assert.equal(network.ADDRESS_HRP, 'tmfcx');
  assert.equal(network.networkStorageKey('mfcoin.accounts.v1'), 'mfcoin.accounts.v1');
  assert.doesNotThrow(() => network.assertWalletNetwork('testnet'));
  assert.throws(() => network.assertWalletNetwork('mainnet'), /does not match/);
});
