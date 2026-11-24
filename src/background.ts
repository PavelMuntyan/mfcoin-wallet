import type { AccountRequest, AccountResponse, WalletState } from './shared/accounts';
import type { ChainRequest, ChainResponse } from './shared/chain';
import { addWatchOnly, confirmBackup, createAccount, exportSecret, getAccountById, getState, importPrivateKey, importSeed, removeAccount, selectAccount } from './background/accounts';
import { deleteHistoryForAccount, getBalance, getHistory, previewTransfer, transfer } from './background/chain';
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
        return { ok: true, state: created.state, backup: created.backup };
      }
      case 'accounts.confirmBackup':
        state = await confirmBackup(request.request.creationId, request.request.words);
        break;
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
      case 'accounts.exportSecret': {
        const secret = await exportSecret(request.request.id, request.request.password, request.request.format);
        state = await getState();
        return { ok: true, state, secret };
      }
      case 'accounts.remove': {
        const account = await getAccountById(request.request.id);
        if (!account) throw new Error('Account not found');
        state = await removeAccount(request.request.id, request.request.password);
        await deleteHistoryForAccount(account.accountId);
        break;
      }
      default:
        throw new Error('Unsupported wallet request');
    }
    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Wallet request failed' };
  }
}

async function handleChain(request: ChainRequest): Promise<ChainResponse<unknown>> {
  try {
    let data: unknown;
    switch (request.type) {
      case 'chain.balance':
        data = await getBalance(request.request.accountId);
        break;
      case 'chain.preview':
        data = await previewTransfer(request.request.sender, request.request.recipient, request.request.amount);
        break;
      case 'chain.transfer':
        data = await transfer(request.request.accountId, request.request.recipient, request.request.amount, request.request.maxFee);
        break;
      case 'chain.history':
        data = await getHistory(request.request.accountId);
        break;
      default:
        throw new Error('Unsupported chain request');
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Chain request failed' };
  }
}

chrome.runtime.onMessage.addListener((request: AccountRequest | ChainRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    const response: AccountResponse = { ok: false, error: 'Untrusted sender' };
    sendResponse(response);
    return false;
  }

  if (request.type.startsWith('chain.')) {
    void handleChain(request as ChainRequest).then(sendResponse);
  } else {
    void handle(request as AccountRequest).then(sendResponse);
  }
  return true;
});
