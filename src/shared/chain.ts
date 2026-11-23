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

export interface TransferResult extends TransferPreview {
  hash: string;
  blockHash: string;
}

export interface HistoryEntry {
  sender: string;
  recipient: string;
  amount: string;
  fee: string;
  hash: string;
  blockHash: string;
  status: 'finalized';
  timestamp: number;
}

export type ChainRequest =
  | { type: 'chain.balance'; request: { accountId: string } }
  | { type: 'chain.preview'; request: { sender: string; recipient: string; amount: string } }
  | { type: 'chain.transfer'; request: { accountId: string; recipient: string; amount: string } }
  | { type: 'chain.history'; request: { accountId: string } };

export type ChainResponse<T> = { ok: true; data: T } | { ok: false; error: string };
