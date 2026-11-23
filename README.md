# MFCoin Wallet

A minimal, English-only browser wallet for the MFCoin community. The project intentionally starts without dApp connectivity or inherited multi-chain features.

## Security boundaries

- Only Sr25519 accounts and explicitly verified MFCoin networks.
- No injected providers, content scripts, `tabs` permission or website signing requests.
- Secrets are encrypted locally. No telemetry or remote account configuration.
- Watch-only accounts cannot sign, including background calls.
- Canonical `tmfcx` and `mfcx` validation with network mismatch protection.
- Pinned genesis verification before any chain query or transaction.
- Spendable balance excludes frozen funds; existential deposit and fee data come from the connected chain.
- A transfer is recorded only after its `ExtrinsicSuccess` event is finalized. Failed dispatches are not shown as successful.

## MVP scope

- Create an account and back it up with password protection.
- Import Sr25519 seed phrases and private keys with public-key verification.
- Add, switch and remove watch-only accounts.
- View native MFC and supported token balances.
- Receive with a canonical address and QR code.
- Send with amount, existential-deposit, weight and length-fee validation plus a gas preview.
- View token-aware transaction history, pagination, finality and reorg status.
- MF Life visual language, dark theme by default and a light-theme toggle.

## Deliberately deferred

- dApp connections and external signing.
- EVM, TON, Cardano, Bitcoin and unrelated chains.
- Swaps until a reviewed swap protocol or pallet exists. A swap cannot be implemented safely as a UI-only feature.
- Hardware wallets, unified accounts, proxies and advanced multisig workflows.

Community modules can extend these areas later without enlarging the trusted core.

## Current status

Implemented: PBKDF2/AES-GCM password vault, account creation with one-time seed backup, Sr25519 seed and private-key import, Testnet/Mainnet watch-only accounts, account switching, and lock/unlock. Secret storage was checked in Chrome to contain ciphertext only. Mainnet watch-only is display-only and marked `not live`; the public network is Testnet 112.

Native MFC balances, Receive QR codes, signed Testnet transfers, runtime gas previews and finalized local history are implemented. Chrome verification covered balance queries, QR rendering, a nonzero fee preview, real signing, finalization, actual fee recording and history after reload. Watch-only signing, cross-network recipients and wrong-genesis RPC endpoints were rejected; a failed dispatch was not recorded as successful.

History currently contains up to 100 successful native transfers initiated by this device. It is not a complete chain history. Indexer-backed incoming/token history and pagination remain next; token history depends on a supported token pallet.

## Development

Requires Node.js 20.20 or newer.

```sh
npm ci
npm run typecheck
NODE_ENV=production npm run build
```

The extension is generated in `build/`. Load that directory through `chrome://extensions` in developer mode.
