import { FormEvent, useEffect, useState } from 'react';
import { sendWalletRequest } from './api';
import type { PublicAccount, SecretFormat, WalletState } from '../shared/accounts';

interface Props {
  account: PublicAccount;
  onChange: (state: WalletState) => void;
  onDeleted: (state: WalletState) => void;
}

function CopyIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" /><path d="M3.5 10.5h-1v-9h9v1" fill="none" stroke="currentColor" /></svg>;
}

export default function SettingsPanel({ account, onChange, onDeleted }: Props) {
  const [format, setFormat] = useState<SecretFormat>(account.kind === 'seed' ? 'seedPhrase' : 'privateKey');
  const [password, setPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setFormat(account.kind === 'seed' ? 'seedPhrase' : 'privateKey');
    setPassword('');
    setDeletePassword('');
    setConfirmation('');
    setSecret('');
    setShowDelete(false);
    setError('');
    setNotice('');
  }, [account.id, account.kind]);

  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => setSecret(''), 10_000);
    return () => clearTimeout(timer);
  }, [secret]);

  async function reveal(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setSecret('');
    try {
      const response = await sendWalletRequest({ type: 'accounts.exportSecret', request: { id: account.id, password, format } });
      if (!response.secret) throw new Error('Secret export failed');
      setSecret(response.secret);
      setPassword('');
      onChange(response.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Secret export failed');
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setNotice('Secret copied. Clipboard history and other applications can expose it. Clear the clipboard after use.');
    } catch {
      setError('Clipboard access was denied');
    }
  }

  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await sendWalletRequest({ type: 'accounts.remove', request: { id: account.id, password: deletePassword } });
      setDeletePassword('');
      setConfirmation('');
      setSecret('');
      onDeleted(response.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account deletion failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="settings-panel">
      <summary>Settings</summary>
      <div className="settings-content">
        <section>
          <h3>Security & backup</h3>
          {account.kind !== 'watchOnly' ? (
            <>
              <p>Export only in a private place. Anyone with this secret controls your funds. Screenshots, screen recordings, other applications and clipboard history can expose it.</p>
              <form className="form-stack" onSubmit={reveal}>
                {account.kind === 'seed' && (
                  <label>Export format<select value={format} onChange={(event) => { setFormat(event.target.value as SecretFormat); setSecret(''); }}><option value="seedPhrase">Seed phrase</option><option value="privateKey">Private key · 32-byte Sr25519 secret seed</option></select></label>
                )}
                <label>Wallet password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
                <button className="secondary-button" type="submit" disabled={busy}>Reveal secret for 10 seconds</button>
              </form>
              <div className="secret-export">
                <code>{secret || '••••••••••••••••••••••••••••••••'}</code>
                <div className="secret-actions">
                  {secret && <button className="text-button" type="button" onClick={() => setSecret('')}>Hide now</button>}
                  <button className="text-button copy-secret-button" type="button" disabled={!secret} onClick={copySecret}><CopyIcon /> Copy secret</button>
                </div>
              </div>
            </>
          ) : (
            <p>This watch-only account contains a public address only. There is no private key to export.</p>
          )}
        </section>

        <section className="delete-section">
          <h3>Delete account</h3>
          {!showDelete ? (
            <button className="secondary-button" type="button" onClick={() => setShowDelete(true)}>Delete from this device</button>
          ) : (
            <form className="form-stack" onSubmit={remove}>
              <p>This removes the account and its local history. Without a seed phrase or private key backup, funds cannot be recovered.</p>
              <label>Type DELETE to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required pattern="DELETE" /></label>
              <label>Wallet password<input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" required /></label>
              <div className="delete-actions">
                <button className="secondary-button" type="button" onClick={() => { setShowDelete(false); setConfirmation(''); setDeletePassword(''); }}>Cancel</button>
                <button className="danger-button" type="submit" disabled={busy || confirmation !== 'DELETE'}>Delete account</button>
              </div>
            </form>
          )}
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
      </div>
    </details>
  );
}
