import { FormEvent, useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { sendChainRequest } from './api';
import { formatMfc, shortHash } from './format';
import type { PublicAccount } from '../shared/accounts';
import type { BalanceView, HistoryEntry, TransferPreview, TransferResult } from '../shared/chain';

interface Props {
  account: PublicAccount;
}

export default function ChainPanel({ account }: Props) {
  const [qr, setQr] = useState('');
  const [balance, setBalance] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<TransferPreview>();
  const [result, setResult] = useState<TransferResult>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setResult(undefined);
    setError('');
    setNotice('');
    setBalance('');
    setHistory([]);
    toDataURL(account.address, { errorCorrectionLevel: 'M', margin: 2, width: 220, color: { dark: '#0b0d0a', light: '#d9ff63' } })
      .then((value) => !cancelled && setQr(value))
      .catch(() => !cancelled && setQr(''));

    if (account.network === 'testnet') {
      void loadBalance();
      void loadHistory();
    }
    return () => { cancelled = true; };
  }, [account.id]);

  async function loadBalance() {
    try {
      const response = await sendChainRequest<BalanceView>({ type: 'chain.balance', request: { accountId: account.accountId } });
      setBalance(response.data.free);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load balance');
    }
  }

  async function loadHistory() {
    try {
      const response = await sendChainRequest<HistoryEntry[]>({ type: 'chain.history', request: { accountId: account.accountId } });
      setHistory(response.data);
    } catch {
      setHistory([]);
    }
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function previewTransfer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setResult(undefined);
    try {
      const response = await sendChainRequest<TransferPreview>({ type: 'chain.preview', request: { sender: account.accountId, recipient: recipient.trim(), amount } });
      setPreview(response.data);
    } catch (caught) {
      setPreview(undefined);
      setError(caught instanceof Error ? caught.message : 'Unable to calculate fee');
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer() {
    if (!preview) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await sendChainRequest<TransferResult>({ type: 'chain.transfer', request: { accountId: account.id, recipient: recipient.trim(), amount } });
      setResult(response.data);
      setPreview(undefined);
      setRecipient('');
      setAmount('');
      setNotice('Transaction finalized');
      await Promise.all([loadBalance(), loadHistory()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chain-panel">
      <details className="receive-panel">
          <summary>Receive MFC</summary>
          <div className="receive-content">
            {qr && <img className="receive-qr" src={qr} alt={`QR code for ${account.address}`} />}
            <code className="full-address">{account.address}</code>
            <button className="secondary-button" type="button" onClick={copyAddress}>{copied ? 'Copied' : 'Copy address'}</button>
          </div>
      </details>

      {account.network === 'testnet' && (
        <div className="balance-line">
          <span>Available</span>
          <strong>{balance ? formatMfc(balance) : 'Loading…'}</strong>
          <button className="text-button" type="button" onClick={loadBalance}>Refresh</button>
        </div>
      )}

      {account.kind !== 'watchOnly' && account.network === 'testnet' ? (
        <details className="send-panel">
          <summary>Send MFC</summary>
          <form className="form-stack" onSubmit={previewTransfer}>
            <label>Recipient address<input value={recipient} onChange={(event) => { setRecipient(event.target.value); setPreview(undefined); }} placeholder="tmfcx1…" autoComplete="off" required /></label>
            <label>Amount<input value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(undefined); }} placeholder="0.001" inputMode="decimal" required /></label>
            <button className="primary-button" type="submit" disabled={busy}>Calculate gas</button>
          </form>
          {preview && (
            <div className="preview-card">
              <p>Amount <strong>{formatMfc(preview.amount)}</strong></p>
              <p>Gas fee <strong>{formatMfc(preview.fee)}</strong></p>
              <p>Total <strong>{formatMfc(preview.total)}</strong></p>
              <p>Remaining <strong>{formatMfc(preview.remaining)}</strong></p>
              <button className="primary-button" type="button" disabled={busy} onClick={confirmTransfer}>Sign and send</button>
            </div>
          )}
          {result && <p className="form-notice">Finalized transaction: <code>{shortHash(result.hash)}</code></p>}
        </details>
      ) : (
        <p className="watch-note">{account.kind === 'watchOnly' ? 'Watch-only accounts cannot sign transactions.' : 'Mainnet transfers are not live.'}</p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {account.network === 'testnet' && (
        <details className="history-panel">
          <summary>History</summary>
          {history.length ? (
            <div className="history-list">
              {history.map((entry) => (
                <article key={entry.hash}>
                  <div><strong>{entry.sender === account.accountId ? 'Sent' : 'Received'} {formatMfc(entry.amount)}</strong><span>{entry.status}</span></div>
                  <p>Fee {formatMfc(entry.fee)}</p>
                  <code>{shortHash(entry.hash)}</code>
                </article>
              ))}
            </div>
          ) : (
            <p className="watch-note">No finalized transactions from this device yet.</p>
          )}
        </details>
      )}
    </section>
  );
}
