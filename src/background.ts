import type { AccountRequest, AccountResponse, WalletState } from './shared/accounts';
import { addWatchOnly, createAccount, getState, importPrivateKey, importSeed, selectAccount } from './background/accounts';
import { createVault, lockVault, unlockVault } from './background/vault';

async function handle(request: AccountRequest): Promise<AccountResponse> {
  try {
    let state: WalletState;
    switch (request.type) {
      case 'wallet.getState':
        state = await getState();
        break;
      case 'wallet.createPassword':
        await createVault(request.request.password);
        state = await getState();
        break;
      case 'wallet.unlock':
        await unlockVault(request.request.password);
        state = await getState();
        break;
      case 'wallet.lock':
        lockVault();
        state = await getState();
        break;
      case 'accounts.create': {
        const created = await createAccount(request.request.name);
        return { ok: true, state: created.state, backup: { mnemonic: created.mnemonic } };
      }
      case 'accounts.importSeed':
        state = await importSeed(request.request.name, request.request.mnemonic);
        break;
      case 'accounts.importPrivateKey':
        state = await importPrivateKey(request.request.name, request.request.privateKey);
        break;
      case 'accounts.watchOnly':
        state = await addWatchOnly(request.request.name, request.request.address, request.request.network);
        break;
      case 'accounts.select':
        state = await selectAccount(request.request.id);
        break;
      default:
        throw new Error('Unsupported wallet request');
    }
    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Wallet request failed' };
  }
}

chrome.runtime.onMessage.addListener((request: AccountRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    const response: AccountResponse = { ok: false, error: 'Untrusted sender' };
    sendResponse(response);
    return false;
  }

  void handle(request).then(sendResponse);
  return true;
});
