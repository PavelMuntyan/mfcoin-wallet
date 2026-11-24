import { FormEvent, useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { sendChainRequest } from './api';
import { formatMfc, shortHash } from './format';
import SettingsPanel from './SettingsPanel';
import AssetPanel from './AssetPanel';
import type { PublicAccount, WalletState } from '../shared/accounts';
import type { BalanceView, HistoryDirection, HistoryEntry, HistoryPage, TransferPreview, TransferResult } from '../shared/chain';

interface Props {
  account: PublicAccount;
  onChange: (state: WalletState) => void;
  onDeleted: (state: WalletState) => void;
}

function historyTitle(entry: HistoryEntry, accountId: string): string {
  if (entry.kind === 'deposit') return 'Reward';
  if (entry.kind === 'withdraw') return 'Fee / withdrawal';
  if (entry.kind === 'reserved') return 'Reserved';
  if (entry.kind === 'unreserved') return 'Unreserved';
  if (entry.kind === 'dustLost') return 'Dust lost';
  if (entry.kind === 'slashed') return 'Slashed';
  return entry.sender === accountId ? 'Sent' : 'Received';
}

function historyHref(entry: HistoryEntry): string {
  if (entry.hash) return `https://mf.life/explorer/#/tx/${entry.hash}`;
  if (entry.blockNumber !== undefined) return `https://mf.life/explorer/#/block/${entry.blockNumber}`;
  return 'https://mf.life/explorer/';
}

export default function ChainPanel({ account, onChange, onDeleted }: Props) {
  const [qr, setQr] = useState('');
  const [balance, setBalance] = useState('');
  const [historyPage, setHistoryPage] = useState<HistoryPage>();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<TransferPreview>();
  const [result, setResult] = useState<TransferResult>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const history = historyPage?.balanceEvents || [];
  const hasPending = history.some((entry) => entry.sender === account.accountId && entry.status === 'pending');

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setResult(undefined);
    setError('');
    setNotice('');
    setBalance('');
    setHistoryPage(undefined);
    toDataURL(account.address, { errorCorrectionLevel: 'M', margin: 2, width: 220, color: { dark: '#0b0d0a', light: '#d9ff63' } })
      .then((value) => !cancelled && setQr(value))
      .catch(() => !cancelled && setQr(''));

    if (account.network === 'testnet') {
      void loadBalance();
      void loadHistory();
    }
    return () => { cancelled = true; };
  }, [account.id]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void loadHistory(), 15_000);
    return () => clearInterval(timer);
  }, [hasPending, account.id]);

  async function loadBalance() {
    try {
      const response = await sendChainRequest<BalanceView>({ type: 'chain.balance', request: { accountId: account.accountId } });
      setBalance(response.data.free);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load balance');
    }
  }

  async function loadHistory(direction?: HistoryDirection) {
    try {
      const cursor = direction === 'before' ? historyPage?.nextCursor : historyPage?.previousCursor;
      const response = await sendChainRequest<HistoryPage>({ type: 'chain.history', request: { accountId: account.accountId, direction, cursor: cursor || undefined } });
      setHistoryPage(response.data);
    } catch {
      setHistoryPage({ balanceEvents: [], nextCursor: null, previousCursor: null, hasOlder: false, hasNewer: false, source: 'local' });
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
    if (!preview || hasPending) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await sendChainRequest<TransferResult>({ type: 'chain.transfer', request: { accountId: account.id, recipient: recipient.trim(), amount, maxFee: preview.fee } });
      setResult(response.data);
      setPreview(undefined);
      setRecipient('');
      setAmount('');
      if (response.data.status === 'finalized') setNotice('Transaction finalized');
      else if (response.data.status === 'pending') setNotice('Transaction submitted. Waiting for finalization; do not submit it again.');
      else if (response.data.status === 'dropped') setError('Transaction expired or was dropped. Review it before trying again.');
      else setError('Transaction was included but failed. Review the history before trying again.');
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
          {account.network === 'mainnet' && <p className="watch-note">Mainnet · not live</p>}
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
          {hasPending && <p className="watch-note">A transaction is pending. Wait for a final status before sending another one.</p>}
          <form className="form-stack" onSubmit={previewTransfer}>
            <label>Recipient address<input value={recipient} onChange={(event) => { setRecipient(event.target.value); setPreview(undefined); }} placeholder="tmfcx1…" autoComplete="off" required /></label>
            <label>Amount<input value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(undefined); }} placeholder="0.001" inputMode="decimal" required /></label>
            <button className="primary-button" type="submit" disabled={busy || hasPending}>Calculate gas</button>
          </form>
          {preview && (
            <div className="preview-card">
              <div className="confirmation-address"><span>Recipient · Testnet 112</span><code>{recipient.trim()}</code></div>
              <p>Amount <strong>{formatMfc(preview.amount)}</strong></p>
              <p>Maximum gas fee <strong>{formatMfc(preview.fee)}</strong></p>
              <p>Total <strong>{formatMfc(preview.total)}</strong></p>
              <p>Remaining <strong>{formatMfc(preview.remaining)}</strong></p>
              <button className="primary-button" type="button" disabled={busy || hasPending} onClick={confirmTransfer}>Sign and send</button>
            </div>
          )}
          {result && <p className="form-notice">{result.status === 'finalized' ? 'Finalized' : result.status === 'pending' ? 'Pending' : 'Not finalized'} transaction: <code>{shortHash(result.hash)}</code></p>}
        </details>
      ) : (
        <p className="watch-note">{account.kind === 'watchOnly' ? 'Watch-only accounts cannot sign transactions.' : 'Mainnet transfers are not live.'}</p>
      )}

      {account.network === 'testnet' && <AssetPanel account={account} />}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {account.network === 'testnet' && (
        <details className="history-panel">
          <summary>History</summary>
          {historyPage?.source === 'local' && <p className="watch-note">Explorer is unavailable. Showing local history only.</p>}
          {history.length ? (
            <div className="history-list">
              {history.map((entry) => (
                <a className="history-entry" key={entry.id || entry.hash} href={historyHref(entry)} target="_blank" rel="noreferrer">
                  <div><strong>{historyTitle(entry, account.accountId)} {formatMfc(entry.amount)}</strong><span>{entry.status}</span></div>
                  {entry.kind && entry.kind !== 'transfer' ? <p>{entry.kind}</p> : <p>Fee {formatMfc(entry.fee)}</p>}
                  {entry.error && <p>{entry.error}</p>}
                  <code>{entry.hash ? shortHash(entry.hash) : `Block #${entry.blockNumber}`}</code>
                </a>
              ))}
            </div>
          ) : (
            <p className="watch-note">No transactions from this device yet.</p>
          )}
          <nav className="pagination-controls" aria-label="Account history pages">
            <button className="load-more" type="button" hidden={!historyPage?.hasNewer} onClick={() => loadHistory('after')}>← Newer 30</button>
            <button className="load-more" type="button" hidden={!historyPage?.hasOlder} onClick={() => loadHistory('before')}>Older 30 →</button>
          </nav>
        </details>
      )}

      <SettingsPanel account={account} onChange={onChange} onDeleted={onDeleted} />
    </section>
  );
}
