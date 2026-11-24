const activeAccounts = new Set<string>();

export function acquireAccountLock(accountId: string): () => void {
  if (activeAccounts.has(accountId)) throw new Error('A transaction is already being signed for this account');
  activeAccounts.add(accountId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeAccounts.delete(accountId);
  };
}

export function isAccountActive(accountId: string): boolean {
  return activeAccounts.has(accountId);
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (values: Record<string, unknown>) => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(values[key] as T | undefined);
    });
  });
}

export async function hasPendingTransaction(walletId: string, accountId: string): Promise<boolean> {
  const [nativeHistory, assetHistory] = await Promise.all([
    storageGet<Array<{ sender: string | null; status: string }>>('mfcoin.history.v1'),
    storageGet<Array<{ walletId?: string; accountId: string; status: string }>>('mfcoin.assets.history.v1')
  ]);
  return Boolean(
    nativeHistory?.some((entry) => entry.sender === accountId && entry.status === 'pending')
    || assetHistory?.some((entry) => (entry.walletId === walletId || entry.accountId === accountId) && entry.status === 'pending')
  );
}
