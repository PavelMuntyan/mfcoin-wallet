import { FormEvent, useEffect, useRef, useState } from 'react';
import { sendChainRequest } from './api';
import { formatAsset, formatMfc, shortHash } from './format';
import type { PublicAccount } from '../shared/accounts';
import type { AssetBalances, AssetHistoryEntry, AssetHistoryPage, AssetOperation, AssetOperationInput, AssetPreview, AssetResult, HistoryDirection } from '../shared/chain';

const OPERATIONS: { id: AssetOperation; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'transfer', label: 'Send' },
  { id: 'mint', label: 'Mint' }
];

function historyTitle(entry: AssetHistoryEntry): string {
  if (entry.status === 'metadataRequired') return 'Metadata required';
  if (entry.kind === 'metadataSet') return 'Metadata';
  if (entry.kind === 'burn') return 'Burn';
  if (entry.kind === 'created') return 'Create asset';
  if (entry.operation === 'create') return entry.stage === 'metadata' ? 'Create + metadata' : 'Create asset';
  return entry.operation === 'mint' ? 'Mint' : 'Asset transfer';
}

export default function AssetPanel({ account }: { account: PublicAccount }) {
  const [operation, setOperation] = useState<AssetOperation>('create');
  const [balances, setBalances] = useState<AssetBalances>({ assets: [], supported: true, truncated: false });
  const [historyPage, setHistoryPage] = useState<AssetHistoryPage>();
  const [assetId, setAssetId] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState(12);
  const [preview, setPreview] = useState<AssetPreview>();
  const [metadataId, setMetadataId] = useState('');
  const [result, setResult] = useState<AssetResult>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);
  const history = historyPage?.assetEvents || [];
  const hasPending = history.some((entry) => entry.accountId === account.accountId && entry.status === 'pending');

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setPreview(undefined);
    setMetadataId('');
    setResult(undefined);
    setError('');
    setNotice('');
    setHistoryPage(undefined);
    void refresh(generation);
    return () => { requestGeneration.current += 1; };
  }, [account.id]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [hasPending, account.id]);

  function input(): AssetOperationInput {
    return operation === 'create'
      ? { operation, name, symbol, decimals }
      : { operation, assetId, amount, recipient };
  }

  async function loadAssets(generation = requestGeneration.current) {
    const response = await sendChainRequest<AssetBalances>({ type: 'chain.assets', request: { accountId: account.accountId } });
    if (generation === requestGeneration.current) setBalances(response.data);
  }

  async function loadHistory(direction?: HistoryDirection, generation = requestGeneration.current) {
    const cursor = direction === 'before' ? historyPage?.nextCursor : historyPage?.previousCursor;
    const response = await sendChainRequest<AssetHistoryPage>({ type: 'chain.assetHistory', request: { accountId: account.accountId, direction, cursor: cursor || undefined } });
    if (generation === requestGeneration.current) setHistoryPage(response.data);
  }

  async function refresh(generation = requestGeneration.current) {
    try {
      await Promise.all([loadAssets(generation), loadHistory(undefined, generation)]);
      if (generation === requestGeneration.current) setError('');
    } catch (caught) {
      if (generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Unable to load community assets');
    }
  }

  function changeOperation(next: AssetOperation) {
    setOperation(next);
    setPreview(undefined);
    setMetadataId('');
    setResult(undefined);
    setError('');
    setNotice('');
  }

  async function calculate(event: FormEvent) {
    event.preventDefault();
    const generation = requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    setResult(undefined);
    setMetadataId('');
    try {
      const response = await sendChainRequest<AssetPreview>({ type: 'chain.assetPreview', request: { sender: account.accountId, input: input() } });
      if (generation === requestGeneration.current) setPreview(response.data);
    } catch (caught) {
      if (generation === requestGeneration.current) {
        setPreview(undefined);
        setError(caught instanceof Error ? caught.message : 'Unable to preview asset operation');
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  async function reviewMetadata(entry: AssetHistoryEntry) {
    if (!entry.id) return;
    const generation = requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    setResult(undefined);
    try {
      const response = await sendChainRequest<AssetPreview>({ type: 'chain.assetMetadataPreview', request: { accountId: account.id, historyId: entry.id } });
      if (generation === requestGeneration.current) {
        setMetadataId(entry.id);
        setPreview(response.data);
      }
    } catch (caught) {
      if (generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Unable to preview metadata');
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  async function submit() {
    if (!preview || hasPending) return;
    const generation = requestGeneration.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = metadataId
        ? await sendChainRequest<AssetResult>({ type: 'chain.assetMetadataSubmit', request: { accountId: account.id, historyId: metadataId, maxFee: preview.fee } })
        : await sendChainRequest<AssetResult>({ type: 'chain.assetSubmit', request: { accountId: account.id, input: input(), maxFee: preview.fee } });
      if (generation !== requestGeneration.current) return;
      setResult(response.data);
      setPreview(undefined);
      setMetadataId('');
      if (response.data.status === 'finalized') setNotice(metadataId ? 'Asset metadata finalized' : response.data.operation === 'create' ? 'Asset and metadata finalized in two transactions' : 'Asset transaction finalized');
      else if (response.data.status === 'metadataRequired') setNotice('Asset created. Review and sign its metadata to finish.');
      else if (response.data.status === 'pending') setNotice('Submitted. Waiting for finalization; do not submit it again.');
      else setError('Asset transaction was not finalized successfully. Review its history before trying again.');
      await refresh(generation);
    } catch (caught) {
      if (generation === requestGeneration.current) {
        setError(caught instanceof Error ? caught.message : 'Asset transaction failed');
        await refresh(generation);
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  return (
    <details className="assets-panel">
      <summary>Community assets</summary>
      <div className="assets-content">
        {!balances.supported ? (
          <p className="watch-note">This runtime does not support community assets yet.</p>
        ) : (
          <>
            {balances.truncated && <p className="watch-note">Only the first 200 indexed asset balances were loaded.</p>}
            <div className="asset-balances">
              {balances.assets.length ? balances.assets.map((asset) => (
                <button key={asset.assetId} type="button" title={`Unverified community asset. Owner: ${asset.ownerAddress}`} onClick={() => { setAssetId(String(asset.assetId)); changeOperation('transfer'); }}>
                  <span><strong>{asset.symbol || `#${asset.assetId}`}</strong><small>{asset.name || `Asset ${asset.assetId}`} · ID {asset.assetId} · UNVERIFIED</small></span>
                  <b>{formatAsset(asset.balance || '0', asset.decimals, asset.symbol)}</b>
                </button>
              )) : <p className="watch-note">No community asset balances on this account.</p>}
            </div>
          </>
        )}

        {account.kind !== 'watchOnly' && balances.supported && (
          <div className="asset-operations">
            <div className="account-tabs" role="tablist" aria-label="Asset operations">
              {OPERATIONS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={operation === item.id} onClick={() => changeOperation(item.id)}>{item.label}</button>)}
            </div>
            {hasPending && <p className="watch-note">An asset transaction is pending. Wait for a final status before signing another one.</p>}
            <form className="form-stack" onSubmit={calculate}>
              {operation === 'create' ? (
                <>
                  <p>Create reserves 100 MFC plus metadata deposits. Creation and metadata are reviewed and signed separately. Names and symbols are unverified.</p>
                  <label>Asset name<input value={name} onChange={(event) => { setName(event.target.value); setPreview(undefined); }} maxLength={64} required /></label>
                  <label>Symbol<input value={symbol} onChange={(event) => { setSymbol(event.target.value.toUpperCase()); setPreview(undefined); }} maxLength={16} required /></label>
                  <label>Decimals<input type="number" min={0} max={18} step={1} value={decimals} onChange={(event) => { setDecimals(Number(event.target.value)); setPreview(undefined); }} required /></label>
                </>
              ) : (
                <>
                  <label>Asset ID<input value={assetId} onChange={(event) => { setAssetId(event.target.value); setPreview(undefined); }} inputMode="numeric" placeholder="1" required /></label>
                  <label>Amount<input value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(undefined); }} inputMode="decimal" placeholder="0.001" required /></label>
                  {operation === 'transfer' && <label>Recipient address<input value={recipient} onChange={(event) => { setRecipient(event.target.value); setPreview(undefined); }} placeholder="tmfcx1…" autoComplete="off" required /></label>}
                  {operation === 'mint' && <p>Only the issuer can mint. New units are issued to the selected account.</p>}
                </>
              )}
              <button className="primary-button" type="submit" disabled={busy || hasPending}>Review operation</button>
            </form>
            {preview && (
              <div className="preview-card">
                <div className="confirmation-address"><span>{metadataId ? 'SET METADATA' : preview.operation.toUpperCase()} · ASSET #{preview.assetId} · TESTNET 115 · UNVERIFIED</span><code>{preview.name || 'Metadata is not set'} {preview.symbol ? `(${preview.symbol})` : ''}</code></div>
                {preview.recipient && <div className="confirmation-address"><span>Recipient</span><code>{preview.recipient}</code></div>}
                {preview.operation !== 'create' && <p>Amount <strong>{formatAsset(preview.amount, preview.decimals, preview.symbol)}</strong></p>}
                <p>{metadataId ? 'Maximum total gas (create + metadata)' : 'Maximum total gas'} <strong>{formatMfc(preview.fee)}</strong></p>
                <p>{metadataId ? 'Metadata gas + reserve' : 'Gas + refundable reserves'} <strong>{formatMfc(preview.nativeTotal)}</strong></p>
                <p>Remaining native MFC <strong>{formatMfc(preview.remaining)}</strong></p>
                <button className="primary-button" type="button" disabled={busy || hasPending} onClick={submit}>{metadataId ? 'Sign metadata' : preview.operation === 'create' ? 'Sign asset creation' : 'Sign and send'}</button>
              </div>
            )}
            {result && <p className="form-notice">{result.status}: <code>{shortHash(result.hash)}</code></p>}
          </div>
        )}
        {account.kind === 'watchOnly' && <p className="watch-note">Watch-only accounts cannot create, mint or transfer assets.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}

        <section className="asset-history">
          <h3>Asset history</h3>
          {historyPage?.source === 'local' && <p className="watch-note">Explorer is unavailable. Showing local asset history only.</p>}
          {history.length ? history.map((entry) => (
            <article className="history-entry" key={entry.id || entry.hash}>
              <a href={entry.hash ? `https://mf.life/explorer/#/tx/${entry.hash}` : `https://mf.life/explorer/#/asset/${entry.assetId}`} target="_blank" rel="noreferrer">
                <div><strong>{historyTitle(entry)} · #{entry.assetId}</strong><span>{entry.status}</span></div>
                <p>{entry.amount && entry.decimals !== undefined ? formatAsset(entry.amount, entry.decimals, entry.symbol || '') : entry.name || entry.symbol || 'Asset operation'}</p>
                <p>Fee {formatMfc(entry.fee)}{entry.stage === 'metadata' ? ' · two transactions' : ''}</p>
                {entry.error && <p>{entry.error}</p>}
                <code>{entry.hash ? shortHash(entry.hash) : `Block #${entry.blockNumber}`}</code>
              </a>
              {entry.status === 'metadataRequired' && <button className="secondary-button" type="button" disabled={busy} onClick={() => reviewMetadata(entry)}>Review metadata</button>}
            </article>
          )) : <p className="watch-note">No asset operations yet.</p>}
          <nav className="pagination-controls" aria-label="Asset history pages">
            <button className="load-more" type="button" hidden={!historyPage?.hasNewer} onClick={() => loadHistory('after')}>← Newer 30</button>
            <button className="load-more" type="button" hidden={!historyPage?.hasOlder} onClick={() => loadHistory('before')}>Older 30 →</button>
          </nav>
        </section>
      </div>
    </details>
  );
}
