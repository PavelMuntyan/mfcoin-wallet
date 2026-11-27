import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync('src/background/chain.ts', 'utf8');
const panel = readFileSync('src/ui/ChainPanel.tsx', 'utf8');
const shared = readFileSync('src/shared/chain.ts', 'utf8');

test('native transfer returns submission errors to the UI', () => {
  assert.ok(background.includes('error: outcome.error'));
  assert.ok(shared.includes('error?: string;'));
  assert.ok(panel.includes('if (response.data.error) setError(response.data.error)'));
});

test('native transfer shows immediate progress and errors next to the send form', () => {
  assert.ok(panel.includes("busy ? 'Signing and sending…' : 'Sign and send'"));
  assert.ok(panel.indexOf('{error &&') < panel.indexOf('<AssetPanel'));
});


test('native transfer hides the hash while pending and links it after finalization', () => {
  assert.ok(panel.includes('resultHistoryStatus'));
  assert.ok(panel.includes('transactionPending'));
  assert.ok(panel.includes('transaction-spinner'));
  assert.ok(panel.includes('Transaction is on its way. Waiting for finalization…'));
  assert.ok(panel.includes('href={`${EXPLORER_WEB_URL}/#/tx/${result.hash}`}'));
  assert.ok(panel.includes('<code>{result.hash}</code>'));
  assert.ok(!panel.includes('<code>{shortHash(result.hash)}</code>'));
  const styles = readFileSync('public/styles.css', 'utf8');
  assert.ok(styles.includes('@keyframes transaction-spin'));
});
