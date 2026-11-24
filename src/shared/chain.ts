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

export type ChainRequest =
  | { type: 'chain.balance'; request: { accountId: string } }
  | { type: 'chain.preview'; request: { sender: string; recipient: string; amount: string } }
  | { type: 'chain.transfer'; request: { accountId: string; recipient: string; amount: string; maxFee: string } }
  | { type: 'chain.history'; request: { accountId: string; direction?: HistoryDirection; cursor?: string } };

export type ChainResponse<T> = { ok: true; data: T } | { ok: false; error: string };
