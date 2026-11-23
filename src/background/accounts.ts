import Keyring from '@polkadot/keyring';
import { waitReady } from '@polkadot/wasm-crypto';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { encodeAddress, validateAddress } from '../lib/mfc-address.js';
import type { AccountKind, MfcNetwork, PublicAccount, WalletState } from '../shared/accounts';
import { hasVault, isUnlocked, storeSecret } from './vault';

const ACCOUNTS_KEY = 'mfcoin.accounts.v1';
const CURRENT_KEY = 'mfcoin.currentAccount.v1';
let cryptoReady: Promise<unknown> | undefined;

function waitForCrypto(): Promise<unknown> {
  cryptoReady ||= waitReady();
  return cryptoReady;
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

async function readAccounts(): Promise<PublicAccount[]> {
  return (await storageGet<PublicAccount[]>(ACCOUNTS_KEY)) || [];
}

async function saveAccounts(accounts: PublicAccount[], currentAccountId?: string): Promise<void> {
  await storageSet({ [ACCOUNTS_KEY]: accounts, [CURRENT_KEY]: currentAccountId });
}

function validateName(name: string, accounts: PublicAccount[]): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 32) throw new Error('Account name must contain 1–32 characters');
  if (accounts.some((account) => account.name.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('An account with this name already exists');
  }
  return normalized;
}

function assertUnique(accountId: string, accounts: PublicAccount[]): void {
  if (accounts.some((account) => account.accountId === accountId)) {
    throw new Error('This account is already in the wallet');
  }
}

async function addAccount(name: string, kind: AccountKind, network: MfcNetwork, accountId: string, secret?: string): Promise<WalletState> {
  if (!isUnlocked()) throw new Error('Wallet is locked');
  const accounts = await readAccounts();
  const normalizedName = validateName(name, accounts);
  assertUnique(accountId, accounts);

  const id = crypto.randomUUID();
  if (secret) await storeSecret(id, secret);

  const account: PublicAccount = {
    id,
    accountId,
    address: encodeAddress(network === 'mainnet' ? 'mfcx' : 'tmfcx', accountId),
    name: normalizedName,
    kind,
    network,
    createdAt: Date.now()
  };
  accounts.push(account);
  await saveAccounts(accounts, id);
  return getState();
}

export async function createAccount(name: string): Promise<{ state: WalletState; mnemonic: string }> {
  await waitForCrypto();
  const mnemonic = mnemonicGenerate(12);
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromUri(mnemonic);
  const state = await addAccount(name, 'seed', 'testnet', u8aToHex(pair.publicKey), mnemonic);
  return { state, mnemonic };
}

export async function importSeed(name: string, mnemonic: string): Promise<WalletState> {
  await waitForCrypto();
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!mnemonicValidate(normalized)) throw new Error('Invalid seed phrase');
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromUri(normalized);
  return addAccount(name, 'seed', 'testnet', u8aToHex(pair.publicKey), normalized);
}

export async function importPrivateKey(name: string, privateKey: string): Promise<WalletState> {
  await waitForCrypto();
  const normalized = privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error('Private key must contain exactly 32 bytes in hexadecimal form');
  const pair = new Keyring({ ss58Format: 42, type: 'sr25519' }).addFromSeed(hexToU8a(normalized));
  return addAccount(name, 'privateKey', 'testnet', u8aToHex(pair.publicKey), normalized);
}

export async function addWatchOnly(name: string, address: string, network: MfcNetwork): Promise<WalletState> {
  const accountId = validateAddress(network === 'mainnet' ? 'mfcx' : 'tmfcx', address.trim());
  return addAccount(name, 'watchOnly', network, accountId);
}

export async function selectAccount(id: string): Promise<WalletState> {
  const accounts = await readAccounts();
  if (!accounts.some((account) => account.id === id)) throw new Error('Account not found');
  await saveAccounts(accounts, id);
  return getState();
}

export async function getState(): Promise<WalletState> {
  const [initialized, accounts, currentAccountId] = await Promise.all([
    hasVault(),
    readAccounts(),
    storageGet<string>(CURRENT_KEY)
  ]);
  return { initialized, unlocked: isUnlocked(), accounts, currentAccountId };
}
