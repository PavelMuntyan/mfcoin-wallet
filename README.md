# MFCoin Wallet

A minimal, English-only browser wallet for the MFCoin community. The project intentionally starts without dApp connectivity or inherited multi-chain features.

## Security boundaries

- Only Sr25519 accounts and explicitly verified MFCoin networks.
- No injected providers, content scripts, `tabs` permission or website signing requests.
- Secrets are encrypted locally. No telemetry or remote account configuration.
- Watch-only accounts cannot sign, including background calls.
- Canonical `tmfcx` and `mfcx` validation with network mismatch protection.
- Pinned genesis verification before any transaction.
- Pending, finalized, failed and reorg-aware transaction states rather than optimistic success screens.

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

## Development

Requires Node.js 20.20 or newer.

```sh
npm ci
npm run typecheck
NODE_ENV=production npm run build
```

The extension is generated in `build/`. Load that directory through `chrome://extensions` in developer mode.
