import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import type { AccountInfo, RuntimeDispatchInfo } from '@polkadot/types/interfaces';
import { waitReady } from '@polkadot/wasm-crypto';
import { decodeAddress } from '../lib/mfc-address.js';
import type { BalanceView, HistoryEntry, TransferPreview, TransferResult } from '../shared/chain';
import { getAccountById } from './accounts';
import { readSecret } from './vault';

const RPC_URL = process.env.MFCOIN_RPC_URL || 'wss://mf.life/ws';
const GENESIS_HASH = process.env.MFCOIN_GENESIS_HASH || '0x085a6799f4e791867e6dbd152e47eda04df2cb05add46f278ec4553f3e5b8a52';
const UNIT = 1_000_000_000_000n;
const HISTORY_KEY = 'mfcoin.history.v1';
let apiPromise: Promise<ApiPromise> | undefined;

async function getApi(): Promise<ApiPromise> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = await ApiPromise.create({ provider: new WsProvider(RPC_URL, 2_500, {}, 10_000) });
      await api.isReady;
      if (api.genesisHash.toHex() !== GENESIS_HASH) {
        await api.disconnect();
        throw new Error('RPC genesis mismatch');
      }
      return api;
    })().catch((error) => {
      apiPromise = undefined;
      throw error;
    });
  }
  return apiPromise;
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

async function appendHistory(entry: HistoryEntry): Promise<void> {
  const history = (await storageGet<HistoryEntry[]>(HISTORY_KEY)) || [];
  history.unshift(entry);
  await storageSet({ [HISTORY_KEY]: history.slice(0, 100) });
}

export async function transfer(accountId: string, recipient: string, amount: string): Promise<TransferResult> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error('Account not found');
  if (account.kind === 'watchOnly') throw new Error('Watch-only accounts cannot sign');
  if (account.network !== 'testnet') throw new Error('Mainnet transfers are not live');

  const preview = await createPreview(account.accountId, recipient, amount);
  const secret = await readSecret(account.id);
  await waitReady();
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromUri(secret);
  const api = await getApi();
  const recipientAccountId = decodeAddress(recipient).accountId;
  const amountBase = BigInt(preview.amount);
  const extrinsic = await api.tx.balances!.transferKeepAlive!(recipientAccountId, amountBase).signAsync(pair);
  const result = await new Promise<{ hash: string; blockHash: string; fee: string }>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Transaction was not finalized within 90 seconds')), 90_000);
    const finish = (error?: Error, value?: { hash: string; blockHash: string; fee: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      if (error) reject(error);
      else if (value) resolve(value);
    };

    void extrinsic.send((submission) => {
      if (submission.isError) {
        finish(new Error(`Transaction submission failed: ${submission.status.type}`));
        return;
      }
      if (!submission.isFinalized) return;
      if (submission.dispatchError) {
        if (submission.dispatchError.isModule) {
          const meta = api.registry.findMetaError(submission.dispatchError.asModule);
          finish(new Error(`Transaction failed: ${meta.section}.${meta.name}`));
        } else {
          finish(new Error(`Transaction failed: ${submission.dispatchError.toString()}`));
        }
        return;
      }
      if (!submission.events.some(({ event }) => api.events.system!.ExtrinsicSuccess!.is(event))) {
        finish(new Error('Finalized transaction has no success event'));
        return;
      }
      const feeEvent = submission.events.find(({ event }) => api.events.transactionPayment!.TransactionFeePaid!.is(event));
      finish(undefined, {
        hash: extrinsic.hash.toHex(),
        blockHash: submission.status.asFinalized.toHex(),
        fee: feeEvent?.event.data[1]?.toString() || preview.fee
      });
    }).then((stop) => {
      unsubscribe = stop;
      if (settled) stop();
    }).catch((error: unknown) => finish(error instanceof Error ? error : new Error('Transaction submission failed')));
  });

  const entry: HistoryEntry = {
    sender: account.accountId,
    recipient: recipientAccountId,
    amount: preview.amount,
    fee: result.fee,
    hash: result.hash,
    blockHash: result.blockHash,
    status: 'finalized',
    timestamp: Date.now()
  };
  await appendHistory(entry);
  return { ...preview, ...result };
}

export async function getHistory(accountId: string): Promise<HistoryEntry[]> {
  const history = (await storageGet<HistoryEntry[]>(HISTORY_KEY)) || [];
  return history
    .filter((entry) => entry.sender === accountId || entry.recipient === accountId)
    .sort((a, b) => b.timestamp - a.timestamp);
}
