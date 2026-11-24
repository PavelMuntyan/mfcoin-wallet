import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import type { Vec } from '@polkadot/types-codec';
import type { AccountInfo, EventRecord, RuntimeDispatchInfo } from '@polkadot/types/interfaces';
import { waitReady } from '@polkadot/wasm-crypto';
import { decodeAddress, encodeAddress } from '../lib/mfc-address.js';
import type { BalanceView, HistoryDirection, HistoryEntry, HistoryPage, TransferPreview, TransferResult, TransferStatus } from '../shared/chain';
import { getAccountById } from './accounts';
import { readSecret } from './vault';

const RPC_URL = process.env.MFCOIN_RPC_URL || 'wss://mf.life/ws';
const EXPLORER_URL = process.env.MFCOIN_EXPLORER_URL || 'https://mf.life/api/explorer';
const GENESIS_HASH = process.env.MFCOIN_GENESIS_HASH || '0x085a6799f4e791867e6dbd152e47eda04df2cb05add46f278ec4553f3e5b8a52';
const FINALITY_TIMEOUT_MS = Number(process.env.MFCOIN_FINALITY_TIMEOUT_MS || 90_000);
const UNIT = 1_000_000_000_000n;
const HISTORY_KEY = 'mfcoin.history.v1';
const MORTALITY_BLOCKS = 64;
let apiPromise: Promise<ApiPromise> | undefined;
let reconciling = false;

async function assertGenesis(api: ApiPromise): Promise<void> {
  const genesis = await api.rpc.chain.getBlockHash(0);
  if (genesis.toHex() !== GENESIS_HASH) throw new Error('RPC genesis mismatch');
}

export async function getApi(): Promise<ApiPromise> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = await ApiPromise.create({ provider: new WsProvider(RPC_URL, 2_500, {}, 10_000) });
      await api.isReady;
      await assertGenesis(api);
      return api;
    })().catch((error) => {
      apiPromise = undefined;
      throw error;
    });
  }
  const api = await apiPromise;
  try {
    await assertGenesis(api);
    return api;
  } catch (error) {
    apiPromise = undefined;
    await api.disconnect();
    throw error;
  }
}

export function formatMfc(value: bigint): string {
  const whole = value / UNIT;
  const fraction = (value % UNIT).toString().padStart(12, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseMfcAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,12})?$/.test(normalized)) {
    throw new Error('Amount must be a positive decimal with at most 12 decimal places');
  }
  const [whole = '0', fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(12, '0'));
  if (amount <= 0n) throw new Error('Amount must be greater than zero');
  return amount;
}

function spendableBalance(account: AccountInfo): bigint {
  const data = account.data as AccountInfo['data'] & { frozen?: { toString(): string } };
  const free = BigInt(data.free.toString());
  const frozen = data.frozen
    ? BigInt(data.frozen.toString())
    : [data.miscFrozen, data.feeFrozen]
      .map((value) => BigInt(value.toString()))
      .reduce((maximum, value) => value > maximum ? value : maximum, 0n);
  return free > frozen ? free - frozen : 0n;
}

export async function getBalance(accountId: string): Promise<BalanceView> {
  const api = await getApi();
  const account = await api.query.system!.account!(accountId) as AccountInfo;
  return {
    free: spendableBalance(account).toString(),
    existentialDeposit: api.consts.balances!.existentialDeposit!.toString()
  };
}

async function createPreview(sender: string, recipient: string, amount: string): Promise<TransferPreview> {
  const decodedRecipient = decodeAddress(recipient);
  if (decodedRecipient.network !== 'testnet') throw new Error('Recipient address is not a Testnet 112 address');
  const amountBase = parseMfcAmount(amount);
  const api = await getApi();
  const [account, extrinsic] = await Promise.all([
    api.query.system!.account!(sender) as Promise<AccountInfo>,
    api.tx.balances!.transferKeepAlive!(decodedRecipient.accountId, amountBase)
  ]);
  const dispatchInfo = await extrinsic.paymentInfo(sender) as RuntimeDispatchInfo;
  const existentialDeposit = BigInt(api.consts.balances!.existentialDeposit!.toString());
  const free = spendableBalance(account);
  const fee = BigInt(dispatchInfo.partialFee.toString());
  const total = amountBase + fee;
  const remaining = free - total;

  if (remaining < existentialDeposit) {
    throw new Error(`Insufficient balance for amount, fee and the ${formatMfc(existentialDeposit)} MFC existential deposit`);
  }

  return {
    amount: amountBase.toString(),
    fee: fee.toString(),
    total: total.toString(),
    free: free.toString(),
    remaining: remaining.toString()
  };
}

export async function previewTransfer(sender: string, recipient: string, amount: string): Promise<TransferPreview> {
  return createPreview(sender, recipient, amount);
}

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

async function readHistory(): Promise<HistoryEntry[]> {
  return (await storageGet<HistoryEntry[]>(HISTORY_KEY)) || [];
}

async function upsertHistory(entry: HistoryEntry): Promise<void> {
  const history = await readHistory();
  const index = history.findIndex((candidate) => candidate.hash === entry.hash);
  if (index >= 0 && history[index]!.status !== 'pending' && entry.status === 'pending') return;
  if (index >= 0) history[index] = entry;
  else history.unshift(entry);
  history.sort((a, b) => b.timestamp - a.timestamp);
  await storageSet({ [HISTORY_KEY]: history.slice(0, 100) });
}

function dispatchErrorText(api: ApiPromise, error: { isModule: boolean; asModule: unknown; toString(): string }): string {
  if (error.isModule) {
    const meta = api.registry.findMetaError(error.asModule as Parameters<ApiPromise['registry']['findMetaError']>[0]);
    return `${meta.section}.${meta.name}`;
  }
  return error.toString();
}

async function reconcileEntry(api: ApiPromise, entry: HistoryEntry): Promise<void> {
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
      await upsertHistory({
        ...entry,
        blockHash: blockHash.toHex(),
        status: failed ? 'failed' : 'finalized',
        fee: feeEvent?.event.data[1]?.toString() || entry.fee,
        error: failed ? dispatchErrorText(api, failed.event.data[0] as never) : undefined,
        lastCheckedNumber: number
      });
      return;
    }
    checked = number;
  }
  const status: TransferStatus = entry.expiresAfter !== undefined && finalizedNumber > entry.expiresAfter ? 'dropped' : 'pending';
  await upsertHistory({ ...entry, status, lastCheckedNumber: checked });
}

async function reconcilePending(): Promise<void> {
  if (reconciling) return;
  const pending = (await readHistory()).filter((entry) => entry.status === 'pending');
  if (!pending.length) return;
  reconciling = true;
  try {
    const api = await getApi();
    for (const entry of pending) await reconcileEntry(api, entry);
  } catch {
    return;
  } finally {
    reconciling = false;
  }
}

export async function transfer(accountId: string, recipient: string, amount: string, maxFee: string): Promise<TransferResult> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');
  if (account.kind === 'watchOnly') throw new Error('Watch-only accounts cannot sign');
  if (account.network !== 'testnet') throw new Error('Mainnet transfers are not live');
  if ((await readHistory()).some((entry) => entry.sender === account.accountId && entry.status === 'pending')) {
    throw new Error('A transaction is already pending for this account');
  }

  const preview = await createPreview(account.accountId, recipient, amount);
  if (!/^\d+$/.test(maxFee)) throw new Error('A valid maximum fee is required');
  if (BigInt(preview.fee) > BigInt(maxFee)) throw new Error('Fee increased after preview; review the new fee before signing');

  const secret = await readSecret(account.id, account.accountId);
  await waitReady();
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromUri(secret);
  if (u8aToHex(pair.publicKey) !== account.accountId) throw new Error('Decrypted key does not match the selected account');

  const api = await getApi();
  const recipientAccountId = decodeAddress(recipient).accountId;
  const amountBase = BigInt(preview.amount);
  const signingHash = await api.rpc.chain.getBlockHash();
  const signingHeader = await api.rpc.chain.getHeader(signingHash);
  const signingNumber = signingHeader.number.toNumber();
  const extrinsic = await api.tx.balances!.transferKeepAlive!(recipientAccountId, amountBase).signAsync(pair, { blockHash: signingHash, era: MORTALITY_BLOCKS });
  const entry: HistoryEntry = {
    sender: account.accountId,
    recipient: recipientAccountId,
    amount: preview.amount,
    fee: preview.fee,
    hash: extrinsic.hash.toHex(),
    blockHash: null,
    status: 'pending',
    timestamp: Date.now(),
    expiresAfter: signingNumber + MORTALITY_BLOCKS,
    lastCheckedNumber: signingNumber - 1
  };
  await upsertHistory(entry);

  const outcome = await new Promise<{ status: TransferStatus; blockHash: string | null; fee: string; error?: string }>((resolve) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const finish = (value: { status: TransferStatus; blockHash: string | null; fee: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      resolve(value);
    };
    const timeout = setTimeout(() => finish({ status: 'pending', blockHash: null, fee: preview.fee }), FINALITY_TIMEOUT_MS);

    void extrinsic.send((submission) => {
      if (submission.isError) {
        finish({ status: 'dropped', blockHash: null, fee: preview.fee, error: `Transaction submission failed: ${submission.status.type}` });
        return;
      }
      if (!submission.isFinalized) return;
      if (submission.dispatchError) {
        finish({
          status: 'failed',
          blockHash: submission.status.asFinalized.toHex(),
          fee: preview.fee,
          error: dispatchErrorText(api, submission.dispatchError)
        });
        return;
      }
      if (!submission.events.some(({ event }) => api.events.system!.ExtrinsicSuccess!.is(event))) {
        finish({ status: 'failed', blockHash: submission.status.asFinalized.toHex(), fee: preview.fee, error: 'Finalized transaction has no success event' });
        return;
      }
      const feeEvent = submission.events.find(({ event }) => api.events.transactionPayment!.TransactionFeePaid!.is(event));
      finish({
        status: 'finalized',
        blockHash: submission.status.asFinalized.toHex(),
        fee: feeEvent?.event.data[1]?.toString() || preview.fee
      });
    }).then((stop) => {
      unsubscribe = stop;
      if (settled) stop();
    }).catch((error: unknown) => finish({
      status: 'pending',
      blockHash: null,
      fee: preview.fee,
      error: error instanceof Error ? error.message : 'Transaction status is temporarily unavailable'
    }));
  });

  const finalEntry = { ...entry, ...outcome };
  await upsertHistory(finalEntry);
  return {
    ...preview,
    hash: entry.hash,
    blockHash: outcome.blockHash,
    status: outcome.status,
    fee: outcome.fee
  };
}

interface ExplorerMovement {
  id: string;
  blockNumber: number;
  blockHash: string;
  extrinsicHash: string | null;
  kind: string;
  fromAccount: string | null;
  toAccount: string | null;
  amount: string;
  fee: string | null;
  timestamp: string;
}

interface ExplorerHistoryPage {
  balanceEvents: ExplorerMovement[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

function mapExplorerMovement(movement: ExplorerMovement): HistoryEntry {
  return {
    id: movement.id,
    sender: movement.fromAccount,
    recipient: movement.toAccount,
    amount: movement.amount,
    fee: movement.fee || '0',
    hash: movement.extrinsicHash || '',
    blockHash: movement.blockHash,
    blockNumber: movement.blockNumber,
    kind: movement.kind,
    status: 'finalized',
    timestamp: Date.parse(movement.timestamp)
  };
}

export async function getHistory(accountId: string, direction?: HistoryDirection, cursor?: string): Promise<HistoryPage> {
  void reconcilePending();
  const localHistory = (await readHistory()).filter((entry) => entry.sender === accountId || entry.recipient === accountId);
  const params = new URLSearchParams({ limit: '30' });
  if (direction && cursor) params.set(direction, cursor);
  const address = encodeAddress('tmfcx', accountId);

  try {
    const response = await fetch(`${EXPLORER_URL}/accounts/${address}/activity?${params}`, {
      headers: { Accept: 'application/json' },
      signal: (AbortSignal as unknown as { timeout(milliseconds: number): AbortSignal }).timeout(10_000)
    });
    if (!response.ok) throw new Error('Explorer history is unavailable');
    const page = await response.json() as ExplorerHistoryPage;
    if (!Array.isArray(page.balanceEvents)) throw new Error('Invalid Explorer history response');
    const events = page.balanceEvents.map(mapExplorerMovement);
    const localOnly = localHistory.filter((local) => !local.hash || !events.some((event) => event.hash === local.hash));
    const balanceEvents = direction ? events : [...events, ...localOnly].sort((a, b) => b.timestamp - a.timestamp);
    return {
      balanceEvents,
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
      hasOlder: page.hasOlder,
      hasNewer: page.hasNewer,
      source: 'explorer'
    };
  } catch {
    return {
      balanceEvents: localHistory.sort((a, b) => b.timestamp - a.timestamp),
      nextCursor: null,
      previousCursor: null,
      hasOlder: false,
      hasNewer: false,
      source: 'local'
    };
  }
}

export async function deleteHistoryForAccount(accountId: string): Promise<void> {
  const history = await readHistory();
  await storageSet({
    [HISTORY_KEY]: history.filter((entry) => entry.sender !== accountId && entry.recipient !== accountId)
  });
}

setInterval(() => {
  void reconcilePending();
}, 15_000);
