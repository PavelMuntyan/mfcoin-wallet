import Keyring from '@polkadot/keyring';
import type { ApiPromise } from '@polkadot/api';
import type { RuntimeDispatchInfo } from '@polkadot/types/interfaces';
import type { EventRecord } from '@polkadot/types/interfaces';
import type { Vec } from '@polkadot/types-codec';
import { u8aToHex } from '@polkadot/util';
import { waitReady } from '@polkadot/wasm-crypto';
import { decodeAddress, encodeAddress } from '../lib/mfc-address.js';
import type { AssetBalances, AssetHistoryEntry, AssetHistoryPage, AssetOperation, AssetOperationInput, AssetPreview, AssetResult, CommunityAsset, HistoryDirection, TransferStatus } from '../shared/chain';
import { getAccountById } from './accounts';
import { getApi, getBalance } from './chain';
import { readSecret } from './vault';

const EXPLORER_URL = process.env.MFCOIN_EXPLORER_URL || 'https://mf.life/api/explorer';
const HISTORY_KEY = 'mfcoin.assets.history.v1';
const MORTALITY_BLOCKS = 64;
const FINALITY_TIMEOUT_MS = Number(process.env.MFCOIN_FINALITY_TIMEOUT_MS || 90_000);
const MAX_U128 = (1n << 128n) - 1n;
let reconciling = false;
const activeAccounts = new Set<string>();

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (values: Record<string, unknown>) => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(values[key] as T | undefined);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    });
  });
}

async function readHistory(): Promise<AssetHistoryEntry[]> {
  return (await storageGet<AssetHistoryEntry[]>(HISTORY_KEY)) || [];
}

async function upsertHistory(entry: AssetHistoryEntry): Promise<void> {
  const history = await readHistory();
  const index = history.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0 && history[index]!.status !== 'pending' && entry.status === 'pending'
    && history[index]!.stage === entry.stage && history[index]!.hash === entry.hash) return;
  if (index >= 0) history[index] = entry;
  else history.unshift(entry);
  history.sort((a, b) => b.timestamp - a.timestamp);
  await storageSet({ [HISTORY_KEY]: history.slice(0, 100) });
}

function parseAssetId(value: string | undefined): number {
  if (!value || !/^\d{1,10}$/.test(value)) throw new Error('Asset ID must be an integer');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 4_294_967_295) throw new Error('Asset ID is outside the supported range');
  return id;
}

export function parseAssetAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  const pattern = decimals ? new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(normalized)) throw new Error(`Amount must have at most ${decimals} decimal places`);
  const [whole = '0', fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount <= 0n) throw new Error('Amount must be greater than zero');
  if (amount > MAX_U128) throw new Error('Amount exceeds the asset balance range');
  return amount;
}

function metadataText(value: string | undefined, label: string, maximum: number): string {
  const text = value?.trim() || '';
  const length = new TextEncoder().encode(text).length;
  if (!length || length > maximum) throw new Error(`${label} must contain between 1 and ${maximum} UTF-8 bytes`);
  return text;
}

function assertSupported(api: ApiPromise): void {
  if (!(api.tx.assets as any)?.create || !(api.query.assets as any)?.nextAssetId) throw new Error('Community assets are not supported by this runtime yet');
}

async function assetMetadata(api: ApiPromise, assetId: number): Promise<{ name: string; symbol: string; decimals: number; issuer: string; supply: bigint; balance?: bigint }> {
  assertSupported(api);
  const [details, metadata] = await Promise.all([
    (api.query.assets as any).asset!(assetId),
    (api.query.assets as any).metadata!(assetId)
  ]);
  if (details.isNone) throw new Error('Asset does not exist');
  return {
    name: metadata.name.toUtf8(),
    symbol: metadata.symbol.toUtf8(),
    decimals: metadata.decimals.toNumber(),
    issuer: details.unwrap().issuer.toHex(),
    supply: BigInt(details.unwrap().supply.toString())
  };
}

async function nativePreview(sender: string, fee: bigint, deposit = 0n): Promise<{ nativeTotal: string; remaining: string }> {
  const balance = await getBalance(sender);
  const free = BigInt(balance.free);
  const nativeTotal = fee + deposit;
  const remaining = free - nativeTotal;
  if (remaining < BigInt(balance.existentialDeposit)) throw new Error('Insufficient MFC for fees, deposits and the existential deposit');
  return { nativeTotal: nativeTotal.toString(), remaining: remaining.toString() };
}

async function paymentFee(extrinsic: { paymentInfo(account: string): Promise<unknown> }, sender: string): Promise<bigint> {
  const info = await extrinsic.paymentInfo(sender) as RuntimeDispatchInfo;
  return BigInt(info.partialFee.toString());
}

export async function previewAssetOperation(sender: string, input: AssetOperationInput): Promise<AssetPreview> {
  const api = await getApi();
  assertSupported(api);
  if (input.operation === 'create') {
    const name = metadataText(input.name, 'Asset name', 64);
    const symbol = metadataText(input.symbol, 'Asset symbol', 16);
    if (!Number.isInteger(input.decimals) || input.decimals! < 0 || input.decimals! > 18) throw new Error('Decimals must be an integer between 0 and 18');
    const decimals = input.decimals!;
    const nextId = await (api.query.assets as any).nextAssetId!();
    if (!nextId.isSome) throw new Error('Automatic asset IDs are not initialized');
    const assetId = nextId.unwrap().toNumber();
    if (assetId < 1) throw new Error('Invalid next asset ID');
    const create = (api.tx.assets as any).create!(assetId, sender, 1);
    const setMetadata = (api.tx.assets as any).setMetadata!(assetId, name, symbol, decimals);
    const [createFee, metadataFee] = await Promise.all([paymentFee(create, sender), paymentFee(setMetadata, sender)]);
    const byteLength = BigInt(new TextEncoder().encode(name).length + new TextEncoder().encode(symbol).length);
    const deposit = BigInt((api.consts.assets as any)!.assetDeposit!.toString())
      + BigInt((api.consts.assets as any)!.metadataDepositBase!.toString())
      + BigInt((api.consts.assets as any)!.metadataDepositPerByte!.toString()) * byteLength;
    const native = await nativePreview(sender, createFee + metadataFee, deposit);
    return { operation: 'create', assetId, amount: '0', fee: (createFee + metadataFee).toString(), ...native, name, symbol, decimals };
  }

  const assetId = parseAssetId(input.assetId);
  const metadata = await assetMetadata(api, assetId);
  const amount = parseAssetAmount(input.amount || '', metadata.decimals);
  if (input.operation === 'mint') {
    if (metadata.issuer !== sender) throw new Error('Only the asset issuer can mint');
    if (metadata.supply + amount > MAX_U128) throw new Error('Mint exceeds the asset supply range');
    const extrinsic = (api.tx.assets as any).mint!(assetId, sender, amount);
    const fee = await paymentFee(extrinsic, sender);
    const native = await nativePreview(sender, fee);
    return { operation: 'mint', assetId, amount: amount.toString(), fee: fee.toString(), ...native, name: metadata.name, symbol: metadata.symbol, decimals: metadata.decimals };
  }

  if (input.operation !== 'transfer') throw new Error('Unsupported asset operation');
  const decoded = decodeAddress(input.recipient || '');
  if (decoded.network !== 'testnet') throw new Error('Recipient address is not a Testnet 112 address');
  const [account, extrinsic] = await Promise.all([
    (api.query.assets as any).account!(assetId, sender),
    (api.tx.assets as any).transfer!(assetId, decoded.accountId, amount)
  ]);
  const balance = account.isSome ? BigInt(account.unwrap().balance.toString()) : 0n;
  if (balance < amount) throw new Error('Insufficient asset balance');
  const fee = await paymentFee(extrinsic, sender);
  const native = await nativePreview(sender, fee);
  return { operation: 'transfer', assetId, amount: amount.toString(), fee: fee.toString(), ...native, name: metadata.name, symbol: metadata.symbol, decimals: metadata.decimals, recipient: decoded.accountId };
}

async function signingPair(accountId: string) {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');
  if (account.kind === 'watchOnly') throw new Error('Watch-only accounts cannot sign');
  if (account.network !== 'testnet') throw new Error('Mainnet asset operations are not live');
  const secret = await readSecret(account.id, account.accountId);
  await waitReady();
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromUri(secret);
  if (u8aToHex(pair.publicKey) !== account.accountId) throw new Error('Decrypted key does not match the selected account');
  return { account, pair };
}

function dispatchErrorText(api: ApiPromise, error: { isModule: boolean; asModule: unknown; toString(): string }): string {
  if (error.isModule) {
    const meta = api.registry.findMetaError(error.asModule as Parameters<ApiPromise['registry']['findMetaError']>[0]);
    return `${meta.section}.${meta.name}`;
  }
  return error.toString();
}

interface StageOutcome {
  status: TransferStatus;
  blockHash: string | null;
  blockNumber?: number;
  fee: string;
  error?: string;
}

async function sendStage(api: ApiPromise, extrinsic: any, entry: AssetHistoryEntry, estimatedFee: bigint, previousFee = 0n): Promise<StageOutcome> {
  await upsertHistory({ ...entry, fee: (previousFee + estimatedFee).toString() });
  const outcome = await new Promise<StageOutcome>((resolve) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const finish = (value: StageOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      resolve(value);
    };
    const timeout = setTimeout(() => finish({ status: 'pending', blockHash: null, fee: estimatedFee.toString() }), FINALITY_TIMEOUT_MS);
    void extrinsic.send((submission: any) => {
      if (submission.isError) {
        finish({ status: 'dropped', blockHash: null, fee: estimatedFee.toString(), error: `Transaction submission failed: ${submission.status.type}` });
        return;
      }
      if (!submission.isFinalized) return;
      const blockHash = submission.status.asFinalized.toHex();
      if (submission.dispatchError) {
        finish({ status: 'failed', blockHash, fee: estimatedFee.toString(), error: dispatchErrorText(api, submission.dispatchError) });
        return;
      }
      if (!submission.events.some(({ event }: any) => api.events.system!.ExtrinsicSuccess!.is(event))) {
        finish({ status: 'failed', blockHash, fee: estimatedFee.toString(), error: 'Finalized transaction has no success event' });
        return;
      }
      const feeEvent = submission.events.find(({ event }: any) => api.events.transactionPayment!.TransactionFeePaid!.is(event));
      finish({ status: 'finalized', blockHash, fee: feeEvent?.event.data[1]?.toString() || estimatedFee.toString() });
    }).then((stop: () => void) => {
      unsubscribe = stop;
      if (settled) stop();
    }).catch((error: unknown) => finish({ status: 'pending', blockHash: null, fee: estimatedFee.toString(), error: error instanceof Error ? error.message : 'Transaction status is temporarily unavailable' }));
  });
  const fee = (previousFee + BigInt(outcome.fee)).toString();
  let blockNumber: number | undefined;
  if (outcome.blockHash) blockNumber = (await api.rpc.chain.getHeader(outcome.blockHash)).number.toNumber();
  const finalEntry = { ...entry, ...outcome, fee, blockNumber, lastCheckedNumber: blockNumber ?? entry.lastCheckedNumber };
  await upsertHistory(finalEntry);
  return { ...outcome, fee, blockNumber };
}

async function signStage(api: ApiPromise, pair: ReturnType<Keyring['addFromUri']>, extrinsic: any, entry: AssetHistoryEntry, estimatedFee: bigint, previousFee = 0n): Promise<StageOutcome> {
  const signingHash = await api.rpc.chain.getBlockHash();
  const signingHeader = await api.rpc.chain.getHeader(signingHash);
  const signingNumber = signingHeader.number.toNumber();
  const signed = await extrinsic.signAsync(pair, { blockHash: signingHash, era: MORTALITY_BLOCKS });
  const stageEntry = {
    ...entry,
    hash: signed.hash.toHex(),
    createHash: entry.operation === 'create' && entry.stage === 'create' ? signed.hash.toHex() : entry.createHash,
    status: 'pending' as const,
    expiresAfter: signingNumber + MORTALITY_BLOCKS,
    lastCheckedNumber: signingNumber - 1
  };
  return sendStage(api, signed, stageEntry, estimatedFee, previousFee);
}

async function submitMetadata(api: ApiPromise, entry: AssetHistoryEntry): Promise<StageOutcome> {
  const { account, pair } = await signingPair(entry.walletId || entry.accountId);
  const name = metadataText(entry.name, 'Asset name', 64);
  const symbol = metadataText(entry.symbol, 'Asset symbol', 16);
  const decimals = entry.decimals!;
  const extrinsic = (api.tx.assets as any).setMetadata!(entry.assetId, name, symbol, decimals);
  const fee = await paymentFee(extrinsic, account.accountId);
  const remainingFee = BigInt(entry.maxFee) - BigInt(entry.fee);
  if (remainingFee < 0n || fee > remainingFee) throw new Error('Metadata fee increased after preview; asset exists without metadata');
  const deposit = BigInt((api.consts.assets as any)!.metadataDepositBase!.toString())
    + BigInt((api.consts.assets as any)!.metadataDepositPerByte!.toString()) * BigInt(new TextEncoder().encode(name).length + new TextEncoder().encode(symbol).length);
  await nativePreview(account.accountId, fee, deposit);
  return signStage(api, pair, extrinsic, {
    ...entry,
    stage: 'metadata',
    recipient: account.accountId,
    previousFee: entry.fee,
    blockHash: null,
    blockNumber: undefined,
    status: 'pending',
    error: undefined,
    timestamp: Date.now()
  }, fee, BigInt(entry.fee));
}

export async function submitAssetOperation(accountId: string, input: AssetOperationInput, maxFee: string): Promise<AssetResult> {
  if (!/^\d+$/.test(maxFee)) throw new Error('A valid maximum fee is required');
  if (activeAccounts.has(accountId) || (await readHistory()).some((entry) => (entry.walletId === accountId || entry.accountId === accountId) && entry.status === 'pending')) {
    throw new Error('An asset transaction is already pending for this account');
  }
  activeAccounts.add(accountId);
  try {
    const { account, pair } = await signingPair(accountId);
    const preview = await previewAssetOperation(account.accountId, input);
    if (BigInt(preview.fee) > BigInt(maxFee)) throw new Error('Fee increased after preview; review the new fee before signing');
    const api = await getApi();
    const id = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const base: AssetHistoryEntry = {
      id,
      walletId: account.id,
      accountId: account.accountId,
      operation: preview.operation,
      stage: preview.operation === 'create' ? 'create' : 'operation',
      assetId: preview.assetId,
      recipient: preview.recipient,
      amount: preview.amount,
      name: preview.name,
      symbol: preview.symbol,
      decimals: preview.decimals,
      fee: preview.fee,
      maxFee,
      hash: '',
      blockHash: null,
      status: 'pending',
      timestamp: Date.now()
    };
    if (preview.operation === 'create') {
      const create = (api.tx.assets as any).create!(preview.assetId, account.accountId, 1);
      const createFee = await paymentFee(create, account.accountId);
      const createOutcome = await signStage(api, pair, create, base, createFee);
      const current = (await readHistory()).find((entry) => entry.id === id)!;
      if (createOutcome.status !== 'finalized') return { operation: 'create', assetId: preview.assetId, hash: current.hash, blockHash: createOutcome.blockHash, status: createOutcome.status, fee: createOutcome.fee, stage: 'create' };
      const metadataOutcome = await submitMetadata(api, { ...current, fee: createOutcome.fee, status: 'pending' });
      const final = (await readHistory()).find((entry) => entry.id === id)!;
      return { operation: 'create', assetId: preview.assetId, hash: final.hash, blockHash: metadataOutcome.blockHash, status: metadataOutcome.status, fee: metadataOutcome.fee, stage: 'metadata' };
    }
    const extrinsic = preview.operation === 'mint'
      ? (api.tx.assets as any).mint!(preview.assetId, account.accountId, BigInt(preview.amount))
      : (api.tx.assets as any).transfer!(preview.assetId, preview.recipient!, BigInt(preview.amount));
    const outcome = await signStage(api, pair, extrinsic, base, BigInt(preview.fee));
    return { operation: preview.operation, assetId: preview.assetId, hash: (await readHistory()).find((entry) => entry.id === id)!.hash, blockHash: outcome.blockHash, status: outcome.status, fee: outcome.fee, stage: 'operation' };
  } finally {
    activeAccounts.delete(accountId);
  }
}

async function reconcileEntry(api: ApiPromise, entry: AssetHistoryEntry): Promise<void> {
  const finalizedHash = await api.rpc.chain.getFinalizedHead();
  const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
  const finalizedNumber = finalizedHeader.number.toNumber();
  let checked = entry.lastCheckedNumber ?? 0;
  for (let number = checked + 1; number <= finalizedNumber; number += 1) {
    const blockHash = await api.rpc.chain.getBlockHash(number);
    const block = await api.rpc.chain.getBlock(blockHash);
    const extrinsicIndex = block.block.extrinsics.findIndex((item) => item.hash.toHex() === entry.hash);
    if (extrinsicIndex >= 0) {
      const at = await api.at(blockHash);
      const records = await at.query.system!.events!() as unknown as Vec<EventRecord>;
      const related = records.filter(({ phase }) => phase.isApplyExtrinsic && Number(phase.asApplyExtrinsic.toString()) === extrinsicIndex);
      const failed = related.find(({ event }) => api.events.system!.ExtrinsicFailed!.is(event));
      const feeEvent = related.find(({ event }) => api.events.transactionPayment!.TransactionFeePaid!.is(event));
      const actualFee = feeEvent?.event.data[1]?.toString() || entry.fee;
      const combinedFee = (BigInt(entry.previousFee || '0') + BigInt(actualFee)).toString();
      const status: TransferStatus = failed ? 'failed' : 'finalized';
      const updated = { ...entry, blockHash: blockHash.toHex(), blockNumber: number, status, fee: combinedFee, error: failed ? dispatchErrorText(api, failed.event.data[0] as never) : undefined, lastCheckedNumber: number };
      await upsertHistory(updated);
      if (status === 'finalized' && entry.operation === 'create' && entry.stage === 'create') await submitMetadata(api, updated);
      return;
    }
    checked = number;
  }
  const status: TransferStatus = entry.expiresAfter !== undefined && finalizedNumber > entry.expiresAfter ? 'dropped' : 'pending';
  await upsertHistory({ ...entry, status, lastCheckedNumber: checked });
}

async function reconcilePending(): Promise<void> {
  if (reconciling) return;
  const pending = (await readHistory()).filter((entry) => entry.status === 'pending' && !activeAccounts.has(entry.walletId || entry.accountId));
  if (!pending.length) return;
  reconciling = true;
  try {
    const api = await getApi();
    for (const entry of pending) {
      try {
        await reconcileEntry(api, entry);
      } catch (error) {
        await upsertHistory({ ...entry, error: error instanceof Error ? error.message : 'Pending reconciliation is temporarily unavailable' });
      }
    }
  } finally {
    reconciling = false;
  }
}

async function explorerRequest(path: string): Promise<any> {
  const response = await fetch(`${EXPLORER_URL}${path}`, {
    headers: { Accept: 'application/json' },
    signal: (AbortSignal as unknown as { timeout(milliseconds: number): AbortSignal }).timeout(10_000)
  });
  if (!response.ok) throw new Error('Explorer asset data is unavailable');
  return response.json();
}

export async function getAssets(accountId: string): Promise<AssetBalances> {
  const address = encodeAddress('tmfcx', accountId);
  const result = await explorerRequest(`/accounts/${address}/assets`);
  if (!Array.isArray(result.assets)) throw new Error('Invalid Explorer asset response');
  return { assets: result.assets as CommunityAsset[], supported: Boolean(result.supported), truncated: Boolean(result.truncated) };
}

function mapExplorerEvent(event: any, accountId: string): AssetHistoryEntry {
  const operation: AssetOperation = event.kind === 'created' ? 'create' : event.kind === 'mint' ? 'mint' : event.kind === 'transfer' ? 'transfer' : 'create';
  return {
    id: `asset-${event.id}`,
    accountId,
    operation,
    kind: event.kind,
    stage: event.kind === 'created' ? 'create' : event.kind === 'metadataSet' ? 'metadata' : 'operation',
    assetId: Number(event.assetId),
    recipient: event.toAccount || undefined,
    amount: event.amount || '0',
    name: event.assetName || event.details?.name,
    symbol: event.assetSymbol || event.details?.symbol,
    decimals: event.assetDecimals ?? event.details?.decimals,
    fee: event.fee || '0',
    maxFee: event.fee || '0',
    hash: event.extrinsicHash || '',
    blockHash: event.blockHash,
    blockNumber: event.blockNumber,
    status: 'finalized',
    timestamp: Date.parse(event.timestamp)
  };
}

export async function getAssetHistory(accountId: string, direction?: HistoryDirection, cursor?: string): Promise<AssetHistoryPage> {
  void reconcilePending();
  const local = (await readHistory()).filter((entry) => entry.accountId === accountId);
  const params = new URLSearchParams({ limit: '30' });
  if (direction && cursor) params.set(direction, cursor);
  try {
    const address = encodeAddress('tmfcx', accountId);
    const page = await explorerRequest(`/accounts/${address}/asset-activity?${params}`);
    if (!Array.isArray(page.assetEvents)) throw new Error('Invalid Explorer asset history response');
    const events = (page.assetEvents as any[]).map((event: any) => mapExplorerEvent(event, accountId));
    const localOnly = local.filter((entry) => entry.status === 'pending' || !events.some((event) => event.hash === entry.hash || event.hash === entry.createHash));
    return {
      assetEvents: direction ? events : [...events, ...localOnly].sort((a, b) => b.timestamp - a.timestamp),
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
      hasOlder: page.hasOlder,
      hasNewer: page.hasNewer,
      source: 'explorer'
    };
  } catch {
    return { assetEvents: local.sort((a, b) => b.timestamp - a.timestamp), nextCursor: null, previousCursor: null, hasOlder: false, hasNewer: false, source: 'local' };
  }
}

export async function deleteAssetHistoryForAccount(accountId: string): Promise<void> {
  await storageSet({ [HISTORY_KEY]: (await readHistory()).filter((entry) => entry.accountId !== accountId) });
}

setInterval(() => { void reconcilePending(); }, 15_000);
