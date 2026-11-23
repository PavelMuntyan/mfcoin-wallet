import { useState } from 'react';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <main className="wallet-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="https://mf.life" target="_blank" rel="noreferrer">
          <img src="images/mfcoin-original.svg" alt="" width="42" height="42" />
          <span>MFCOIN <strong>2.0</strong></span>
        </a>
        <button className="theme-button" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light' : 'Dark'} theme
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">MINIMAL BY DESIGN</p>
        <h1>Your keys.<br />Your MFC.</h1>
        <p className="intro">A lightweight, security-first wallet for the MFCoin community. No dApps, no hidden providers, no unnecessary network access.</p>
      </section>

      <section className="security-card" aria-label="Wallet foundation">
        <div className="status-dot" />
        <div>
          <h2>Core foundation ready</h2>
          <p>Accounts, transfers, watch-only wallets and history are being built as small, independently reviewable modules.</p>
        </div>
      </section>

      <section className="principles" aria-label="Security principles">
        <article><span>01</span><h3>Only Sr25519</h3><p>One account type and one explicitly verified network.</p></article>
        <article><span>02</span><h3>No dApp surface</h3><p>No injected providers and no signing requests from websites.</p></article>
        <article><span>03</span><h3>Local secrets</h3><p>Keys stay encrypted on your device. No telemetry.</p></article>
      </section>

      <footer>MF LIFE · COMMUNITY INFRASTRUCTURE</footer>
    </main>
  );
}
