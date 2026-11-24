const UNIT = 1_000_000_000_000n;

export function formatMfc(value: string): string {
  const units = BigInt(value);
  const whole = units / UNIT;
  const fraction = (units % UNIT).toString().padStart(12, '0').replace(/0+$/, '');
  return `${whole.toString()}${fraction ? `.${fraction}` : ''} MFC`;
}

export function formatAsset(value: string, decimals: number, symbol: string): string {
  const units = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = decimals ? (units % base).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return `${whole.toString()}${fraction ? `.${fraction}` : ''}${symbol ? ` ${symbol}` : ''}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}
