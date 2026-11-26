import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const app = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('public/styles.css', 'utf8');
const sidePanel = readFileSync('public/sidepanel.html', 'utf8');
const entry = readFileSync('src/index.tsx', 'utf8');

test('extension supports a right browser side panel and preserves the popup', () => {
  assert.equal(manifest.version, '0.6.5');
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
  assert.equal(manifest.action.default_popup, 'index.html');
  assert.equal(manifest.action.openPanelOnActionClick, true);
  assert.ok(sidePanel.includes('<html lang="en" class="side-panel"'));
});

test('wallet UI opens the current window in the browser side panel', () => {
  assert.ok(app.includes('chrome.sidePanel.open({ windowId: currentWindow.id })'));
  assert.ok(app.includes('chrome.windows.getCurrent()'));
  assert.ok(app.includes('className="side-panel-button"'));
  assert.ok(styles.includes('.topbar-actions'));
});

test('side panel normalizes narrow viewports caused by browser zoom', () => {
  assert.ok(entry.includes('Math.min(1, window.innerWidth / 320)'));
  assert.ok(entry.includes("window.addEventListener('resize', fitSidePanel)"));
  assert.ok(styles.includes('@media (max-width: 319px)'));
  assert.ok(styles.includes('zoom: var(--side-panel-scale)'));
});
