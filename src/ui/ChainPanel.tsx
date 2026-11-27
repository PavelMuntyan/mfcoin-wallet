import { FormEvent, useEffect, useRef, useState } from 'react';
import { toDataURL } from 'qrcode';
import { sendChainRequest } from './api';
import { formatMfc, shortHash } from './format';
import SettingsPanel from './SettingsPanel';
import AssetPanel from './AssetPanel';
import type { PublicAccount, WalletState } from '../shared/accounts';
import type { BalanceView, HistoryDirection, HistoryEntry, HistoryPage, TransferPreview, TransferResult } from '../shared/chain';
import { ADDRESS_HRP, EXPLORER_WEB_URL, NETWORK_LABEL, WALLET_NETWORK } from '../shared/network';

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
  if (entry.hash) return `${EXPLORER_WEB_URL}/#/tx/${entry.hash}`;
  if (entry.blockNumber !== undefined) return `${EXPLORER_WEB_URL}/#/block/${entry.blockNumber}`;
  return `${EXPLORER_WEB_URL}/`;
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
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestGeneration = useRef(0);
  const history = historyPage?.balanceEvents || [];
  const hasPending = history.some((entry) => entry.sender === account.accountId && entry.status === 'pending');
  const resultHistoryStatus = result ? history.find((entry) => entry.hash === result.hash)?.status : undefined;
  const resultStatus = resultHistoryStatus || result?.status;
  const transactionPending = submitting || resultStatus === 'pending';
  const finalizedResult = result && (resultStatus === 'finalized' || resultStatus === 'failed');

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setPreview(undefined);
    setResult(undefined);
    setSubmitting(false);
    setError('');
    setNotice('');
    setBalance('');
    setHistoryPage(undefined);
    toDataURL(account.address, { errorCorrectionLevel: 'M', margin: 2, width: 220, color: { dark: '#0b0d0a', light: '#d9ff63' } })
      .then((value) => generation === requestGeneration.current && setQr(value))
      .catch(() => generation === requestGeneration.current && setQr(''));

    if (account.network === WALLET_NETWORK) {
      void loadBalance(generation);
      void loadHistory(undefined, generation);
    }
    return () => { requestGeneration.current += 1; };
  }, [account.id]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void loadHistory(), 15_000);
    return () => clearInterval(timer);
  }, [hasPending, account.id]);

  async function loadBalance(generation = requestGeneration.current) {
    try {
      const response = await sendChainRequest<BalanceView>({ type: 'chain.balance', request: { accountId: account.accountId } });
      if (generation === requestGeneration.current) setBalance(response.data.free);
    } catch (caught) {
      if (generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Unable to load balance');
    }
  }

  async function loadHistory(direction?: HistoryDirection, generation = requestGeneration.current) {
    try {
      const cursor = direction === 'before' ? historyPage?.nextCursor : historyPage?.previousCursor;
      const response = await sendChainRequest<HistoryPage>({ type: 'chain.history', request: { accountId: account.accountId, direction, cursor: cursor || undefined } });
      if (generation === requestGeneration.current) setHistoryPage(response.data);
    } catch {
      if (generation === requestGeneration.current) setHistoryPage({ balanceEvents: [], nextCursor: null, previousCursor: null, hasOlder: false, hasNewer: false, source: 'local' });
    }
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function previewTransfer(event: FormEvent) {
    event.preventDefault();
    const generation = requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    setResult(undefined);
    try {
      const response = await sendChainRequest<TransferPreview>({ type: 'chain.preview', request: { sender: account.accountId, recipient: recipient.trim(), amount } });
      if (generation === requestGeneration.current) setPreview(response.data);
    } catch (caught) {
      if (generation === requestGeneration.current) {
        setPreview(undefined);
        setError(caught instanceof Error ? caught.message : 'Unable to calculate fee');
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  async function confirmTransfer() {
    if (!preview || hasPending) return;
    const generation = requestGeneration.current;
    setBusy(true);
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await sendChainRequest<TransferResult>({ type: 'chain.transfer', request: { accountId: account.id, recipient: recipient.trim(), amount, maxFee: preview.fee } });
      if (generation !== requestGeneration.current) return;
      setResult(response.data);
      setPreview(undefined);
      setRecipient('');
      setAmount('');
      if (response.data.error) setError(response.data.error);
      else if (response.data.status === 'finalized') setNotice('Transaction finalized');
      else if (response.data.status === 'pending') setNotice('Transaction submitted. Waiting for finalization; do not submit it again.');
      else if (response.data.status === 'dropped') setError('Transaction expired or was dropped. Review it before trying again.');
      else setError('Transaction was included but failed. Review the history before trying again.');
      await Promise.all([loadBalance(generation), loadHistory(undefined, generation)]);
    } catch (caught) {
      if (generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Transfer failed');
    } finally {
      if (generation === requestGeneration.current) {
        setBusy(false);
        setSubmitting(false);
      }
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

      {account.network === WALLET_NETWORK && (
        <div className="balance-line">
          <div className="balance-topline"><span>Available</span><button className="text-button" type="button" onClick={() => loadBalance()}>Refresh</button></div>
          <strong className="balance-value">{balance ? formatMfc(balance) : 'Loading…'}</strong>
        </div>
      )}

      {account.kind !== 'watchOnly' && account.network === WALLET_NETWORK ? (
        <details className="send-panel">
          <summary>Send MFC</summary>
          {hasPending && !transactionPending && <p className="watch-note">A transaction is pending. Wait for a final status before sending another one.</p>}
          <form className="form-stack" onSubmit={previewTransfer}>
            <label>Recipient address<input value={recipient} onChange={(event) => { setRecipient(event.target.value); setPreview(undefined); }} placeholder={`${ADDRESS_HRP}1…`} autoComplete="off" required /></label>
            <label>Amount<input value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(undefined); }} placeholder="0.001" inputMode="decimal" required /></label>
            <button className="primary-button" type="submit" disabled={busy || hasPending}>{busy ? 'Calculating…' : 'Calculate gas'}</button>
          </form>
          {preview && (
            <div className="preview-card">
              <div className="confirmation-address"><span>Recipient · {NETWORK_LABEL}</span><code>{recipient.trim()}</code></div>
              <p>Amount <strong>{formatMfc(preview.amount)}</strong></p>
              <p>Fee cap checked again before signing <strong>{formatMfc(preview.fee)}</strong></p>
              <p>Total <strong>{formatMfc(preview.total)}</strong></p>
              <p>Remaining <strong>{formatMfc(preview.remaining)}</strong></p>
              <button className="primary-button" type="button" disabled={busy || hasPending} onClick={confirmTransfer}>{busy ? 'Signing and sending…' : 'Sign and send'}</button>
            </div>
          )}
          {transactionPending && <p className="transaction-progress" role="status"><span className="transaction-spinner" aria-hidden="true" />Transaction is on its way. Waiting for finalization…</p>}
          {finalizedResult && <p className="transaction-result"><span>{resultStatus === 'finalized' ? 'Transaction finalized' : 'Transaction included but failed'}</span><a className="transaction-link" href={`${EXPLORER_WEB_URL}/#/tx/${result.hash}`} target="_blank" rel="noreferrer"><code>{result.hash}</code><span>Open in Explorer ↗</span></a></p>}
        </details>
      ) : (
        <p className="watch-note">{account.kind === 'watchOnly' ? 'Watch-only accounts cannot sign transactions.' : 'Account network does not match this wallet build.'}</p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {account.network === WALLET_NETWORK && <AssetPanel account={account} />}

      {account.network === WALLET_NETWORK && (
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
