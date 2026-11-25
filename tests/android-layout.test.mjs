import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activity = readFileSync('android/app/src/main/java/life/mf/wallet/MainActivity.java', 'utf8');
const panel = readFileSync('src/ui/ChainPanel.tsx', 'utf8');
const styles = readFileSync('public/styles.css', 'utf8');

test('Android WebView pads content below system bars', () => {
  assert.ok(activity.includes('WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()'));
  assert.ok(activity.includes('rootView.setPadding(bars.left, bars.top, bars.right, bars.bottom)'));
  assert.ok(activity.includes('rootView.setFitsSystemWindows(true)'));
});

test('balance uses a separate top line and a larger centered value', () => {
  assert.ok(panel.includes('className="balance-topline"'));
  assert.ok(panel.includes('className="balance-value"'));
  assert.ok(styles.includes('justify-content: space-between'));
  assert.ok(styles.includes('text-align: center'));
});
