import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('release ZIP contains extension files at the archive root', () => {
  const packaged = spawnSync('node', ['scripts/package-release.mjs'], { encoding: 'utf8' });
  assert.equal(packaged.status, 0, packaged.stderr);
  const listing = spawnSync('unzip', ['-Z1', 'dist/mfcoin-wallet-chrome-0.6.3.zip'], { encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  const files = listing.stdout.trim().split(/\r?\n/);
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('manifest.json'));
  assert.ok(files.includes('index.js'));
  assert.ok(files.includes('background.js'));
  assert.ok(!files.some((file) => file.startsWith('mfcoin-wallet/build/') || file.startsWith('build/')));
});

test('side panel layout follows the panel width instead of the browser viewport', () => {
  const styles = readFileSync('public/styles.css', 'utf8');
  assert.ok(styles.includes('container-type: inline-size'));
  assert.ok(styles.includes('@container (max-width: 800px)'));
  assert.ok(styles.includes('.dashboard h1 { font-size: 34px; }'));
});
