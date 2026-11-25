import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const { installWebChrome } = require(`${process.env.MFC_TEST_BUILD}/chrome-shim.cjs`);
installWebChrome();

test('web storage preserves JSON values and removes keys', async () => {
  await new Promise((resolve) => chrome.storage.local.set({ account: { id: 7 }, enabled: true }, resolve));
  const stored = await new Promise((resolve) => chrome.storage.local.get('account', resolve));
  assert.deepEqual(stored.account, { id: 7 });
  await new Promise((resolve) => chrome.storage.local.remove('account', resolve));
  const removed = await new Promise((resolve) => chrome.storage.local.get('account', resolve));
  assert.equal(removed.account, undefined);
});

test('web runtime delivers a request through the background listener', async () => {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    assert.equal(sender.id, chrome.runtime.id);
    sendResponse({ ok: true, balance: request.amount * 2n });
    return false;
  });
  const response = await chrome.runtime.sendMessage({ amount: 21n });
  assert.deepEqual(response, { ok: true, balance: 42n });
  assert.equal(chrome.runtime.getManifest().version, '0.6.2');
});
