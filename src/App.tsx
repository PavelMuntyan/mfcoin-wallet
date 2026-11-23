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
        <a className="brand" href="https://mf.life" target="_blank" rel="noreferrer">
          <img src="images/mfcoin-original.svg" alt="" width="42" height="42" />
          <span>MFCOIN <strong>2.0</strong></span>
        </a>
        <button className="theme-button" type="button" onClick={changeTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'} theme
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
    </main>
  );
}
