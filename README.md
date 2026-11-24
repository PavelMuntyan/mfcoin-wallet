# MFCoin Wallet

A lightweight, English-only, non-custodial browser wallet for the MFCoin community. The trusted core intentionally excludes dApp connectivity and unrelated chains.

## Security boundaries

- Only Sr25519 accounts and canonical `tmfcx`/`mfcx` addresses.
- PBKDF2-SHA256 with 600,000 iterations and AES-GCM-256 with account-bound additional authenticated data.
- Secrets remain encrypted in extension storage. A 15-minute inactivity timer clears the vault key from the service worker.
- New accounts are saved only after three randomly selected backup words are confirmed.
- Secret export and account deletion require the wallet password. Revealed secrets disappear after 10 seconds.
- Watch-only accounts cannot sign or export a private key, including direct background calls.
- Public-key verification before signing, pinned genesis checks on every new chain operation, and recipient-network validation.
- No content scripts, injected providers, `tabs` permission, website signing, telemetry or remote configuration.

## Implemented

- Create an Sr25519 account with mandatory backup confirmation.
- Import seed phrases and 32-byte private keys; add and switch watch-only accounts.
- Native MFC spendable balance and canonical Receive QR codes.
- Runtime gas preview with full recipient/network confirmation and a user-approved maximum fee.
- Mortal transfers with a 64-block lifetime, `pending`, `finalized`, `failed` and `dropped` states.
- Pending history is stored before broadcast and reconciled after timeout or service-worker restart. A second transfer from the same account is blocked while it is pending.
- Settings with password-gated seed/private-key export, timed reveal, clipboard copy and account deletion.
- MF Life visual language, dark theme by default and a light-theme toggle.

## Deliberately deferred

- dApp connections and external signing.
- EVM, TON, Cardano, Bitcoin and unrelated chains.
- Token balances/history until a supported token pallet and indexer integration exist.
- Complete incoming history from an indexer. Current history covers transactions initiated by this device.
- Swaps until a reviewed protocol or pallet exists.
- Hardware wallets, proxies and advanced multisig workflows.

## Secret-export limitation

The extension cannot prevent screenshots, screen recordings, photographs, clipboard managers or other applications from reading an exported secret. Timed reveal reduces exposure but does not guarantee secrecy. Copy only in a private place and clear the clipboard after use.

## Development

Requires Node.js 20.20 or newer.

```sh
npm ci
npm run typecheck
NODE_ENV=production npm run build
```

The extension is generated in `build/`. Load that directory through `chrome://extensions` in developer mode. The default production manifest contains only `wss://mf.life/ws` connectivity and no localhost permissions.

For a local devnet, set `MFCOIN_RPC_URL`, `MFCOIN_GENESIS_HASH` and optionally `MFCOIN_FINALITY_TIMEOUT_MS` or `MFCOIN_LOCK_TIMEOUT_MS` before building. Localhost permissions are added only when the configured RPC URL is local.

## Verification

Chrome checks covered backup rejection/confirmation, password-gated export and deletion, legacy ciphertext migration, AAD-bound ciphertext rejection, real native signing, recipient confirmation, fee-cap rejection, `pending → finalized` reconciliation without duplication, automatic locking and masked Settings. TypeScript and production builds pass. `npm audit --omit=dev` reports no known vulnerabilities.
