export function reconciliationScanUntil(finalizedNumber: number, expiresAfter?: number): number {
  return expiresAfter === undefined ? finalizedNumber : Math.min(finalizedNumber, expiresAfter);
}

export function reconciliationExpired(finalizedNumber: number, expiresAfter?: number): boolean {
  return expiresAfter !== undefined && finalizedNumber > expiresAfter;
}
