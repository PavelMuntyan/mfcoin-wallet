import type { AccountRequest, AccountResponse } from '../shared/accounts';
import type { ChainRequest, ChainResponse } from '../shared/chain';

export async function sendWalletRequest(request: AccountRequest): Promise<Extract<AccountResponse, { ok: true }>> {
  const response = await chrome.runtime.sendMessage(request) as AccountResponse;
  if (!response.ok) throw new Error(response.error);
  return response;
}

export async function sendChainRequest<T>(request: ChainRequest): Promise<Extract<ChainResponse<T>, { ok: true }>> {
  const response = await chrome.runtime.sendMessage(request) as ChainResponse<T>;
  if (!response.ok) throw new Error(response.error);
  return response;
}
