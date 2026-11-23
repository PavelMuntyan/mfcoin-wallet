import { FormEvent, useEffect, useRef, useState } from 'react';
import { sendWalletRequest } from './api';
import ChainPanel from './ChainPanel';
import type { AccountResponse, PublicAccount, WalletState } from '../shared/accounts';

interface Props {
  state: WalletState;
  onChange: (state: WalletState) => void;
  onLock: () => void;
}

type AccountTab = 'new' | 'import' | 'watchOnly';

const ACCOUNT_TABS: { id: AccountTab; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'import', label: 'Import' },
  { id: 'watchOnly', label: 'Watch-only' }
];

function shortAddress(account?: PublicAccount): string {
  if (!account) return '';
  return `${account.address.slice(0, 12)}…${account.address.slice(-8)}`;
}

function accountType(account: PublicAccount): string {
  if (account.kind === 'watchOnly') return 'Watch-only';
  return account.kind === 'seed' ? 'Seed phrase' : 'Private key';
}

function Chevron() {
  return <svg className="account-chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AccountDashboard({ state, onChange, onLock }: Props) {
  const [name, setName] = useState(`Account ${state.accounts.length + 1}`);
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [watchAddress, setWatchAddress] = useState('');
  const [watchNetwork, setWatchNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [activeTab, setActiveTab] = useState<AccountTab>('new');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [backup, setBackup] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const accountMenuRef = useRef<HTMLElement>(null);

  const current = state.accounts.find((account) => account.id === state.currentAccountId) || state.accounts[0];

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  async function run(action: () => Promise<Extract<AccountResponse, { ok: true }>>): Promise<Extract<AccountResponse, { ok: true }> | undefined> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await action();
      onChange(response.state);
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const response = await run(() => sendWalletRequest({ type: 'accounts.create', request: { name } }));
    if (response?.backup) {
      setBackup(response.backup.mnemonic);
      setName(`Account ${response.state.accounts.length + 1}`);
    }
  }

  async function importSeed(event: FormEvent) {
    event.preventDefault();
    const response = await run(() => sendWalletRequest({ type: 'accounts.importSeed', request: { name, mnemonic } }));
    if (response) {
      setMnemonic('');
      setNotice('Seed phrase imported');
    }
  }

  async function importKey(event: FormEvent) {
    event.preventDefault();
    const response = await run(() => sendWalletRequest({ type: 'accounts.importPrivateKey', request: { name, privateKey } }));
    if (response) {
      setPrivateKey('');
      setNotice('Private key imported');
    }
  }

  async function addWatchOnly(event: FormEvent) {
    event.preventDefault();
    const response = await run(() => sendWalletRequest({ type: 'accounts.watchOnly', request: { name, address: watchAddress, network: watchNetwork } }));
    if (response) {
      setWatchAddress('');
      setNotice('Watch-only account added');
    }
  }

  async function chooseAccount(id: string) {
    setAccountMenuOpen(false);
    await run(() => sendWalletRequest({ type: 'accounts.select', request: { id } }));
  }

  async function copyAddress() {
    if (!current) return;
    await navigator.clipboard.writeText(current.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACCOUNTS</p>
          <h1>Your wallet.</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onLock}>Lock</button>
      </div>

      {backup && (
        <section className="backup-card" aria-label="Seed phrase backup">
          <p className="eyebrow">SAVE THIS SEED PHRASE OFFLINE</p>
          <h2>Your only backup.</h2>
          <p>Write these words down and keep them private. They will not be shown again after you close this screen.</p>
          <code className="seed-backup">{backup}</code>
          <button className="primary-button" type="button" onClick={() => setBackup('')}>I saved it offline</button>
        </section>
      )}

      {current ? (
        <article className="account-card" ref={accountMenuRef}>
          <button className="account-card-switch" type="button" aria-label={`Choose account. Current: ${current.name}`} aria-haspopup="listbox" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)} disabled={busy}>
            <span className="account-card-heading">
              <img src="images/mfcoin-original.svg" alt="" width="42" height="42" />
              <span className="account-card-copy">
                <span className="account-card-title">{current.name}</span>
                <span className="account-card-meta">{accountType(current)} · {current.network === 'mainnet' ? 'Mainnet · not live' : 'Testnet 112'}</span>
              </span>
            </span>
            <Chevron />
          </button>
          <button className="address-button" type="button" onClick={copyAddress} title={current.address}>
            {shortAddress(current)} <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          {accountMenuOpen && (
            <div className="account-options" role="listbox" aria-label="Available accounts">
              {state.accounts.map((account) => (
                <button key={account.id} type="button" role="option" aria-selected={account.id === current.id} onClick={() => chooseAccount(account.id)}>
                  <span className="account-option-copy"><strong>{account.name}</strong><small>{accountType(account)} · {account.network === 'mainnet' ? 'Mainnet' : 'Testnet 112'}</small></span>
                  <span className="account-selected" aria-hidden="true">{account.id === current.id ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </article>
      ) : (
        <article className="account-card empty-account">
          <h2>No accounts yet</h2>
          <p>Create your first Sr25519 account or add a public watch-only address.</p>
        </article>
      )}

      {current && <ChainPanel account={current} />}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      <div className="account-actions">
        <div className="account-tabs" role="tablist" aria-label="Account management" onKeyDown={(event) => {
          const currentIndex = ACCOUNT_TABS.findIndex((tab) => tab.id === activeTab);
          let nextIndex: number | undefined;
          if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ACCOUNT_TABS.length;
          if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ACCOUNT_TABS.length) % ACCOUNT_TABS.length;
          if (event.key === 'Home') nextIndex = 0;
          if (event.key === 'End') nextIndex = ACCOUNT_TABS.length - 1;
          if (nextIndex === undefined) return;
          event.preventDefault();
          const nextTab = ACCOUNT_TABS[nextIndex]!;
          setActiveTab(nextTab.id);
          document.getElementById(`account-tab-${nextTab.id}`)?.focus();
        }}>
          {ACCOUNT_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`account-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`account-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="account-tab-panel" id={`account-panel-${activeTab}`} role="tabpanel" aria-labelledby={`account-tab-${activeTab}`}>
          {activeTab === 'new' && (
            <form className="form-stack" onSubmit={create}>
              <h2>Create account</h2>
              <p>Generate a new Sr25519 account and back up its seed phrase offline.</p>
              <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
              <button className="primary-button" type="submit" disabled={busy}>Create account</button>
            </form>
          )}

          {activeTab === 'import' && (
            <div className="import-forms">
              <form className="form-stack" onSubmit={importSeed}>
                <h2>Import seed phrase</h2>
                <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
                <label>Seed phrase<textarea value={mnemonic} onChange={(event) => setMnemonic(event.target.value)} autoComplete="off" spellCheck={false} rows={3} required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Import seed phrase</button>
              </form>
              <form className="form-stack" onSubmit={importKey}>
                <h2>Import private key</h2>
                <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
                <label>Private key<input type="password" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} autoComplete="off" placeholder="0x…" required /></label>
                <button className="secondary-button" type="submit" disabled={busy}>Import private key</button>
              </form>
            </div>
          )}

          {activeTab === 'watchOnly' && (
            <form className="form-stack" onSubmit={addWatchOnly}>
              <h2>Add watch-only account</h2>
              <p>Track a public address. Watch-only accounts can never sign transactions.</p>
              <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
              <label>Network<select className="network-select" value={watchNetwork} onChange={(event) => setWatchNetwork(event.target.value as 'testnet' | 'mainnet')}><option value="testnet">Testnet 112</option><option value="mainnet">Mainnet · not live</option></select></label>
              <label>Public address<input value={watchAddress} onChange={(event) => setWatchAddress(event.target.value)} placeholder={watchNetwork === 'mainnet' ? 'mfcx1…' : 'tmfcx1…'} autoComplete="off" required /></label>
              <button className="primary-button" type="submit" disabled={busy}>Add watch-only</button>
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
