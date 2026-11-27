import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/ui/AccountDashboard.tsx', 'utf8');

test('account dashboard copies the public AccountId hex for mining without exposing secrets', () => {
  assert.ok(dashboard.includes('navigator.clipboard.writeText(current.accountId)'));
  assert.ok(dashboard.includes('Copy AccountId (Hex) for mining'));
  assert.ok(dashboard.includes('title={current.accountId}'));
  assert.ok(!dashboard.includes('writeText(current.privateKey)'));
  assert.ok(!dashboard.includes('writeText(current.mnemonic)'));
});
