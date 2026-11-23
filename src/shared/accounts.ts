export type AccountKind = 'seed' | 'privateKey' | 'watchOnly';
export type MfcNetwork = 'testnet' | 'mainnet';

export interface PublicAccount {
  id: string;
  accountId: string;
  address: string;
  name: string;
  kind: AccountKind;
  network: MfcNetwork;
  createdAt: number;
}

export interface WalletState {
  initialized: boolean;
  unlocked: boolean;
  accounts: PublicAccount[];
  currentAccountId?: string;
}

export interface CreatePasswordRequest {
  password: string;
}

export interface UnlockRequest {
  password: string;
}

export interface AccountNameRequest {
  name: string;
}

export interface ImportSeedRequest extends AccountNameRequest {
  mnemonic: string;
}

export interface ImportPrivateKeyRequest extends AccountNameRequest {
  privateKey: string;
}

export interface WatchOnlyRequest extends AccountNameRequest {
  address: string;
  network: MfcNetwork;
}

export type AccountRequest =
  | { type: 'wallet.getState' }
  | { type: 'wallet.createPassword'; request: CreatePasswordRequest }
  | { type: 'wallet.unlock'; request: UnlockRequest }
  | { type: 'wallet.lock' }
  | { type: 'accounts.create'; request: AccountNameRequest }
  | { type: 'accounts.importSeed'; request: ImportSeedRequest }
  | { type: 'accounts.importPrivateKey'; request: ImportPrivateKeyRequest }
  | { type: 'accounts.watchOnly'; request: WatchOnlyRequest }
  | { type: 'accounts.select'; request: { id: string } };

export type AccountResponse = { ok: true; state: WalletState; backup?: { mnemonic: string } } | { ok: false; error: string };
