export type MfcHrp = 'mfcx' | 'tmfcx';
export type MfcNetwork = 'mainnet' | 'testnet';

export declare class AddressError extends Error {
  code: string;
}

export declare function encodeAddress(hrp: MfcHrp, accountId: string): string;
export declare function decodeAddress(address: string): { hrp: MfcHrp; network: MfcNetwork; accountId: string };
export declare function validateAddress(expectedHrp: MfcHrp, address: string): string;
