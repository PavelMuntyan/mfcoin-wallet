type MessageListener = (request: unknown, sender: { id: string }, sendResponse: (response: unknown) => void) => boolean | void;

let listener: MessageListener | undefined;
let lastError: { message: string } | undefined;

function readValue(key: string): unknown {
  const value = localStorage.getItem(key);
  return value === null ? undefined : JSON.parse(value);
}

function callbackWithError(callback: () => void): void {
  queueMicrotask(() => {
    try {
      lastError = undefined;
      callback();
    } catch (error) {
      lastError = { message: error instanceof Error ? error.message : 'Storage operation failed' };
      callback();
    }
  });
}

export function installWebChrome(): void {
  const runtime = {
    id: 'mfcoin-wallet-web',
    get lastError() {
      return lastError;
    },
    getManifest() {
      return { version: process.env.MFCOIN_WALLET_VERSION || '0.6.4' };
    },
    onMessage: {
      addListener(next: MessageListener) {
        listener = next;
      }
    },
    async sendMessage(request: unknown): Promise<unknown> {
      if (!listener) throw new Error('Wallet background is not initialized');
      return new Promise((resolve, reject) => {
        let responded = false;
        try {
          const asynchronous = listener!(request, { id: runtime.id }, (response) => {
            responded = true;
            resolve(response);
          });
          if (asynchronous !== true && !responded) reject(new Error('Wallet background did not respond'));
        } catch (error) {
          reject(error);
        }
      });
    }
  };

  const chrome = {
    runtime,
    storage: {
      local: {
        get(key: string, callback: (values: Record<string, unknown>) => void) {
          callbackWithError(() => callback({ [key]: readValue(key) }));
        },
        set(values: Record<string, unknown>, callback: () => void) {
          callbackWithError(() => {
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
            callback();
          });
        },
        remove(key: string, callback: () => void) {
          callbackWithError(() => {
            localStorage.removeItem(key);
            callback();
          });
        }
      }
    }
  };

  Object.assign(globalThis, { chrome });
}
