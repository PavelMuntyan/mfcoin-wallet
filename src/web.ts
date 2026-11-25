import { installWebChrome } from './web/chrome-shim';

installWebChrome();
void import('./background').then(() => import('./index')).catch((error: unknown) => {
  document.body.textContent = error instanceof Error ? error.message : 'Unable to initialize wallet';
});
