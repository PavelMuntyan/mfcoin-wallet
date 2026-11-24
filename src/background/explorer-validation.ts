const HASH = /^0x[0-9a-f]{64}$/;
const ACCOUNT = /^0x[0-9a-f]{64}$/;
const UINT = /^\d+$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid Explorer ${label}`);
  return value as Record<string, unknown>;
}

function uint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UINT.test(value)) throw new Error(`Invalid Explorer ${label}`);
  return value;
}

function nullableUint(value: unknown, label: string): string | null {
  return value === null ? null : uint(value, label);
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`Invalid Explorer ${label}`);
  return value;
}

function nullableHash(value: unknown, label: string): string | null {
  return value === null ? null : hash(value, label);
}

function account(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !ACCOUNT.test(value)) throw new Error(`Invalid Explorer ${label}`);
  return value;
}

function text(value: unknown, label: string, maximum = 128): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`Invalid Explorer ${label}`);
  return value;
}

function number(value: unknown, label: string, maximum = 4_294_967_295): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw new Error(`Invalid Explorer ${label}`);
  return value as number;
}

function timestamp(value: unknown): string {
  const parsed = text(value, 'timestamp', 64);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error('Invalid Explorer timestamp');
  return parsed;
}

function cursor(value: unknown): string | null {
  return value === null ? null : uint(value, 'cursor');
}

function flags(value: Record<string, unknown>): void {
  if (typeof value.hasOlder !== 'boolean' || typeof value.hasNewer !== 'boolean') throw new Error('Invalid Explorer pagination');
}

export function validateHistoryPage(value: unknown): any {
  const page = object(value, 'history response');
  if (!Array.isArray(page.balanceEvents)) throw new Error('Invalid Explorer history response');
  for (const raw of page.balanceEvents) {
    const event = object(raw, 'history event');
    text(event.id, 'event id', 64);
    number(event.blockNumber, 'block number');
    hash(event.blockHash, 'block hash');
    nullableHash(event.extrinsicHash, 'extrinsic hash');
    text(event.kind, 'event kind', 32);
    account(event.fromAccount, 'sender');
    account(event.toAccount, 'recipient');
    uint(event.amount, 'amount');
    nullableUint(event.fee, 'fee');
    timestamp(event.timestamp);
  }
  flags(page);
  return { ...page, nextCursor: cursor(page.nextCursor), previousCursor: cursor(page.previousCursor) };
}

function validateAsset(value: unknown): void {
  const asset = object(value, 'asset');
  number(asset.assetId, 'asset ID', 2_147_483_647);
  text(asset.name, 'asset name');
  text(asset.symbol, 'asset symbol', 32);
  number(asset.decimals, 'asset decimals', 18);
  account(asset.owner, 'asset owner');
  account(asset.admin, 'asset admin');
  uint(asset.supply, 'asset supply');
  uint(asset.minBalance, 'asset minimum balance');
  if (typeof asset.destroyed !== 'boolean') throw new Error('Invalid Explorer asset status');
  if (asset.balance !== undefined) uint(asset.balance, 'asset balance');
}

export function validateAssetBalances(value: unknown): any {
  const result = object(value, 'asset response');
  if (!Array.isArray(result.assets) || typeof result.supported !== 'boolean' || typeof result.truncated !== 'boolean') throw new Error('Invalid Explorer asset response');
  for (const asset of result.assets) validateAsset(asset);
  return result;
}

export function validateAssetHistoryPage(value: unknown): any {
  const page = object(value, 'asset history response');
  if (!Array.isArray(page.assetEvents)) throw new Error('Invalid Explorer asset history response');
  for (const raw of page.assetEvents) {
    const event = object(raw, 'asset event');
    text(event.id, 'event id', 64);
    number(event.blockNumber, 'block number');
    hash(event.blockHash, 'block hash');
    nullableHash(event.extrinsicHash, 'extrinsic hash');
    number(event.assetId, 'asset ID', 2_147_483_647);
    text(event.kind, 'event kind', 32);
    account(event.fromAccount, 'sender');
    account(event.toAccount, 'recipient');
    nullableUint(event.amount, 'asset amount');
    nullableUint(event.fee, 'fee');
    if (event.assetName !== null && event.assetName !== undefined) text(event.assetName, 'asset name');
    if (event.assetSymbol !== null && event.assetSymbol !== undefined) text(event.assetSymbol, 'asset symbol', 32);
    if (event.assetDecimals !== null && event.assetDecimals !== undefined) number(event.assetDecimals, 'asset decimals', 18);
    if (event.details !== null && event.details !== undefined) {
      const details = object(event.details, 'asset details');
      if (details.name !== undefined) text(details.name, 'asset name');
      if (details.symbol !== undefined) text(details.symbol, 'asset symbol', 32);
      if (details.decimals !== undefined) number(details.decimals, 'asset decimals', 18);
      if (details.nameHex !== undefined && !/^0x[0-9a-f]*$/.test(details.nameHex as string)) throw new Error('Invalid Explorer asset name hex');
      if (details.symbolHex !== undefined && !/^0x[0-9a-f]*$/.test(details.symbolHex as string)) throw new Error('Invalid Explorer asset symbol hex');
    }
    timestamp(event.timestamp);
  }
  flags(page);
  return { ...page, nextCursor: cursor(page.nextCursor), previousCursor: cursor(page.previousCursor) };
}
