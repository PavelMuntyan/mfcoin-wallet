import { useEffect, useState } from 'react';
import { sendWalletRequest } from './ui/api';
import Onboarding from './ui/Onboarding';
import AccountDashboard from './ui/AccountDashboard';
import type { WalletState } from './shared/accounts';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('mfcoin.theme') === 'light' ? 'light' : 'dark');
  const [state, setState] = useState<WalletState>();
  const [error, setError] = useState('');

  useEffect(() => {
    sendWalletRequest({ type: 'wallet.getState' })
      .then((response) => setState(response.state))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to initialize wallet'));
  }, []);

  function changeTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('mfcoin.theme', next);
    setTheme(next);
  }

  async function lock() {
    const response = await sendWalletRequest({ type: 'wallet.lock' });
    setState(response.state);
  }

  return (
    <main className="wallet-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="https://mf.life" target="_blank" rel="noreferrer" aria-label="MFCoin 2.0 home">
          <img src="images/mfcoin-original.svg" alt="" width="44" height="44" />
          <span className="brand-name">MFCOIN</span>
          <strong className="brand-version">2.0</strong>
        </a>
        <button className="theme-button" type="button" onClick={changeTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'dark'}>
          <span className="theme-icon" aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          <span className="theme-label">{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
        </button>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!state ? (
        <p className="intro">Initializing wallet…</p>
      ) : !state.unlocked ? (
        <Onboarding initialized={state.initialized} onComplete={setState} />
      ) : (
        <AccountDashboard state={state} onChange={setState} onLock={lock} />
      )}
      <footer className="wallet-version">MFCOIN WALLET · V{chrome.runtime.getManifest().version}</footer>
    </main>
  );
}
