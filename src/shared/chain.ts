export interface BalanceView {
  free: string;
  existentialDeposit: string;
}

export interface TransferPreview {
  amount: string;
  fee: string;
  total: string;
  free: string;
  remaining: string;
}

export type TransferStatus = 'pending' | 'finalized' | 'failed' | 'dropped';

export interface TransferResult extends TransferPreview {
  hash: string;
  blockHash: string | null;
  status: TransferStatus;
}

export interface HistoryEntry {
  id?: string;
  sender: string | null;
  recipient: string | null;
  amount: string;
  fee: string;
  hash: string;
  blockHash: string | null;
  blockNumber?: number;
  kind?: string;
  status: TransferStatus;
  timestamp: number;
  error?: string;
  expiresAfter?: number;
  lastCheckedNumber?: number;
}

export interface HistoryPage {
  balanceEvents: HistoryEntry[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
  source: 'explorer' | 'local';
}

export type HistoryDirection = 'before' | 'after';

export interface CommunityAsset {
  assetId: number;
  name: string;
  symbol: string;
  decimals: number;
  owner: string;
  ownerAddress: string;
  admin: string;
  supply: string;
  minBalance: string;
  destroyed: boolean;
  balance?: string;
}

export interface AssetBalances {
  assets: CommunityAsset[];
  supported: boolean;
  truncated: boolean;
}

export type AssetOperation = 'create' | 'transfer' | 'mint';

export interface AssetOperationInput {
  operation: AssetOperation;
  assetId?: string;
  amount?: string;
  recipient?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface AssetPreview {
  operation: AssetOperation;
  assetId: number;
  amount: string;
  fee: string;
  nativeTotal: string;
  remaining: string;
  name: string;
  symbol: string;
  decimals: number;
  recipient?: string;
}

export interface AssetResult {
  operation: AssetOperation;
  assetId: number;
  hash: string;
  blockHash: string | null;
  status: TransferStatus;
  fee: string;
  stage: 'create' | 'metadata' | 'operation';
}

export interface AssetHistoryEntry {
  id?: string;
  walletId?: string;
  accountId: string;
  operation: AssetOperation;
  kind?: string;
  stage: 'create' | 'metadata' | 'operation';
  assetId: number;
  recipient?: string;
  amount?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  fee: string;
  maxFee: string;
  previousFee?: string;
  hash: string;
  createHash?: string;
  blockHash: string | null;
  blockNumber?: number;
  status: TransferStatus;
  timestamp: number;
  error?: string;
  expiresAfter?: number;
  lastCheckedNumber?: number;
}

export interface AssetHistoryPage {
  assetEvents: AssetHistoryEntry[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
  source: 'explorer' | 'local';
}

export type ChainRequest =
  | { type: 'chain.balance'; request: { accountId: string } }
  | { type: 'chain.preview'; request: { sender: string; recipient: string; amount: string } }
  | { type: 'chain.transfer'; request: { accountId: string; recipient: string; amount: string; maxFee: string } }
  | { type: 'chain.history'; request: { accountId: string; direction?: HistoryDirection; cursor?: string } }
  | { type: 'chain.assets'; request: { accountId: string } }
  | { type: 'chain.assetPreview'; request: { sender: string; input: AssetOperationInput } }
  | { type: 'chain.assetSubmit'; request: { accountId: string; input: AssetOperationInput; maxFee: string } }
  | { type: 'chain.assetHistory'; request: { accountId: string; direction?: HistoryDirection; cursor?: string } };

export type ChainResponse<T> = { ok: true; data: T } | { ok: false; error: string };
