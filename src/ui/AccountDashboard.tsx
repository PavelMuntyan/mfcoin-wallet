import { FormEvent, useState } from 'react';
import { sendWalletRequest } from './api';
import ChainPanel from './ChainPanel';
import type { AccountResponse, PublicAccount, WalletState } from '../shared/accounts';

interface Props {
  state: WalletState;
  onChange: (state: WalletState) => void;
  onLock: () => void;
}

function shortAddress(account?: PublicAccount): string {
  if (!account) return '';
  return `${account.address.slice(0, 12)}…${account.address.slice(-8)}`;
}

function accountType(account: PublicAccount): string {
  if (account.kind === 'watchOnly') return 'Watch-only';
  return account.kind === 'seed' ? 'Seed phrase' : 'Private key';
}

export default function AccountDashboard({ state, onChange, onLock }: Props) {
  const [name, setName] = useState(`Account ${state.accounts.length + 1}`);
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [watchAddress, setWatchAddress] = useState('');
  const [watchNetwork, setWatchNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [backup, setBackup] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const current = state.accounts.find((account) => account.id === state.currentAccountId) || state.accounts[0];

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
        <article className="account-card">
          <div className="account-card-heading">
            <img src="images/mfcoin-original.svg" alt="" width="42" height="42" />
            <div>
              <h2>{current.name}</h2>
              <p>{accountType(current)} · {current.network === 'mainnet' ? 'Mainnet · not live' : 'Testnet 112'}</p>
            </div>
          </div>
          <button className="address-button" type="button" onClick={copyAddress} title={current.address}>
            {shortAddress(current)} <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </article>
      ) : (
        <article className="account-card empty-account">
          <h2>No accounts yet</h2>
          <p>Create your first Sr25519 account or add a public watch-only address.</p>
        </article>
      )}

      {state.accounts.length > 0 && (
        <label>
          Active account
          <select value={current?.id || ''} onChange={(event) => run(() => sendWalletRequest({ type: 'accounts.select', request: { id: event.target.value } }))}>
            {state.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {accountType(account)}</option>
            ))}
          </select>
        </label>
      )}

      {current && <ChainPanel account={current} />}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      <div className="account-actions">
        <details open={state.accounts.length === 0}>
          <summary>Create account</summary>
          <form className="form-stack" onSubmit={create}>
            <p>Generate a new Sr25519 account and back up its seed phrase offline.</p>
            <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
            <button className="primary-button" type="submit" disabled={busy}>Create account</button>
          </form>
        </details>

        <details>
          <summary>Import seed phrase</summary>
          <form className="form-stack" onSubmit={importSeed}>
            <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
            <label>Seed phrase<textarea value={mnemonic} onChange={(event) => setMnemonic(event.target.value)} autoComplete="off" spellCheck={false} rows={3} required /></label>
            <button className="primary-button" type="submit" disabled={busy}>Import seed phrase</button>
          </form>
        </details>

        <details>
          <summary>Import private key</summary>
          <form className="form-stack" onSubmit={importKey}>
            <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
            <label>Private key<input type="password" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} autoComplete="off" placeholder="0x…" required /></label>
            <button className="primary-button" type="submit" disabled={busy}>Import private key</button>
          </form>
        </details>

        <details>
          <summary>Add watch-only account</summary>
          <form className="form-stack" onSubmit={addWatchOnly}>
            <label>Account name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required /></label>
            <label>Network<select value={watchNetwork} onChange={(event) => setWatchNetwork(event.target.value as 'testnet' | 'mainnet')}><option value="testnet">Testnet 112</option><option value="mainnet">Mainnet · not live</option></select></label>
            <label>Public address<input value={watchAddress} onChange={(event) => setWatchAddress(event.target.value)} placeholder={watchNetwork === 'mainnet' ? 'mfcx1…' : 'tmfcx1…'} autoComplete="off" required /></label>
            <button className="primary-button" type="submit" disabled={busy}>Add watch-only</button>
          </form>
        </details>
      </div>
    </section>
  );
}
