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
