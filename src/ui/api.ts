import type { AccountRequest, AccountResponse } from '../shared/accounts';

export async function sendWalletRequest(request: AccountRequest): Promise<Extract<AccountResponse, { ok: true }>> {
  const response = await chrome.runtime.sendMessage(request) as AccountResponse;
  if (!response.ok) throw new Error(response.error);
  return response;
}
