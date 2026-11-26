import type { MfcNetwork } from './accounts';

const configuredNetwork = process.env.MFCOIN_NETWORK || 'testnet';
if (configuredNetwork !== 'testnet' && configuredNetwork !== 'mainnet') throw new Error('Unsupported wallet network');

export const WALLET_NETWORK: MfcNetwork = configuredNetwork;
export const NETWORK_LABEL = WALLET_NETWORK === 'mainnet' ? 'Main Net' : 'Testnet 115';
export const ADDRESS_HRP = WALLET_NETWORK === 'mainnet' ? 'mfcx' : 'tmfcx';
export const EXPLORER_WEB_URL = (process.env.MFCOIN_EXPLORER_WEB_URL || 'https://mf.life/explorer').replace(/\/$/, '');

export function networkStorageKey(key: string): string {
  return WALLET_NETWORK === 'testnet' ? key : `${key}.${WALLET_NETWORK}`;
}

export function assertWalletNetwork(network: MfcNetwork): void {
  if (network !== WALLET_NETWORK) throw new Error('Account network does not match this wallet build');
}
