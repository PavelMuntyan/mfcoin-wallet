import { FormEvent, useState } from 'react';
import { sendWalletRequest } from './api';
import type { WalletState } from '../shared/accounts';

interface Props {
  initialized: boolean;
  onComplete: (state: WalletState) => void;
}

export default function Onboarding({ initialized, onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 10) {
      setError('Password must contain at least 10 characters');
      return;
    }
    if (!initialized && password !== confirmation) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      const response = await sendWalletRequest({
        type: initialized ? 'wallet.unlock' : 'wallet.createPassword',
        request: { password }
      });
      onComplete(response.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to unlock wallet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="onboarding">
      <p className="eyebrow">{initialized ? 'WELCOME BACK' : 'PROTECT YOUR WALLET'}</p>
      <h1>{initialized ? 'Unlock your wallet.' : 'Create a strong password.'}</h1>
      <p className="intro">
        {initialized
          ? 'Enter your password to decrypt your accounts on this device.'
          : 'This password encrypts your seed phrases and private keys. It cannot be recovered by MF Life.'}
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Password
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={initialized ? 'current-password' : 'new-password'}
            minLength={10}
            required
          />
        </label>
        {!initialized && (
          <label>
            Confirm password
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : initialized ? 'Unlock' : 'Create password'}
        </button>
      </form>
    </section>
  );
}
