import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ui/ErrorBoundary';

const container = document.getElementById('root');

if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
  void navigator.serviceWorker.register('./service-worker.js').catch(() => undefined);
}

if (!container) {
  throw new Error('Wallet root is missing');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
