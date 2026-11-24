import type { AssetHistoryEntry } from '../shared/chain';

export function normalizeAssetHistory(entries: AssetHistoryEntry[]): AssetHistoryEntry[] {
  return entries.map((entry) => entry.operation === 'create' && entry.stage === 'create' && entry.status === 'finalized'
    ? { ...entry, status: 'metadataRequired' }
    : entry);
}
