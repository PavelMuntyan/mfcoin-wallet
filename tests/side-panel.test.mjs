import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const app = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('public/styles.css', 'utf8');

test('extension supports a right browser side panel and preserves the popup', () => {
  assert.equal(manifest.version, '0.6.3');
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.side_panel.default_path, 'index.html');
  assert.equal(manifest.action.default_popup, 'index.html');
  assert.equal(manifest.action.openPanelOnActionClick, true);
});

test('wallet UI opens the current window in the browser side panel', () => {
  assert.ok(app.includes('chrome.sidePanel.open({ windowId: currentWindow.id })'));
  assert.ok(app.includes('chrome.windows.getCurrent()'));
  assert.ok(app.includes('className="side-panel-button"'));
  assert.ok(styles.includes('.topbar-actions'));
});
