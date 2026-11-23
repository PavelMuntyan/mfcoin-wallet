const VAULT_META_KEY = 'mfcoin.vault.meta.v1';
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface VaultMeta {
  salt: string;
  verifier: string;
  iv: string;
}

interface EncryptedValue {
  ciphertext: string;
  iv: string;
}

let vaultKey: CryptoKey | undefined;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (values: Record<string, unknown>) => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(values[key] as T | undefined);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    });
  });
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string, key: CryptoKey): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

async function decrypt({ ciphertext, iv }: EncryptedValue, key: CryptoKey): Promise<string> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ciphertext));
  return decoder.decode(plaintext);
}

export async function hasVault(): Promise<boolean> {
  return Boolean(await storageGet<VaultMeta>(VAULT_META_KEY));
}

export function isUnlocked(): boolean {
  return Boolean(vaultKey);
}

export function lockVault(): void {
  vaultKey = undefined;
}

export async function createVault(password: string): Promise<void> {
  if (password.length < 10) throw new Error('Password must contain at least 10 characters');
  if (await hasVault()) throw new Error('A password is already configured');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const key = await deriveKey(password, salt);
  const encryptedVerifier = await encrypt(verifier, key);

  await storageSet({
    [VAULT_META_KEY]: {
      salt: toBase64(salt),
      verifier: encryptedVerifier.ciphertext,
      iv: encryptedVerifier.iv
    } as VaultMeta
  });
  vaultKey = key;
}

export async function unlockVault(password: string): Promise<void> {
  const meta = await storageGet<VaultMeta>(VAULT_META_KEY);
  if (!meta) throw new Error('Create a password first');

  const key = await deriveKey(password, fromBase64(meta.salt));
  try {
    await decrypt({ ciphertext: meta.verifier, iv: meta.iv }, key);
    vaultKey = key;
  } catch {
    throw new Error('Incorrect password');
  }
}

export async function storeSecret(id: string, secret: string): Promise<void> {
  if (!vaultKey) throw new Error('Wallet is locked');
  const encrypted = await encrypt(secret, vaultKey);
  await storageSet({ [`mfcoin.secret.${id}`]: encrypted });
}

export async function readSecret(id: string): Promise<string> {
  if (!vaultKey) throw new Error('Wallet is locked');
  const encrypted = await storageGet<EncryptedValue>(`mfcoin.secret.${id}`);
  if (!encrypted) throw new Error('Account secret not found');
  return decrypt(encrypted, vaultKey);
}
