const UNIT = 1_000_000_000_000n;

export function formatMfc(value: string): string {
  const units = BigInt(value);
  const whole = units / UNIT;
  const fraction = (units % UNIT).toString().padStart(12, '0').replace(/0+$/, '');
  return `${whole.toString()}${fraction ? `.${fraction}` : ''} MFC`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}
