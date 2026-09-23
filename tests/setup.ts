/**
 * Vitest global setup — mocks chrome.storage.local
 */
import { vi } from 'vitest';

// Mock chrome.storage.local
const _store: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string, cb?: (r: Record<string, unknown>) => void) => {
        const res = { [key]: _store[key] };
        if (typeof cb === 'function') {
          cb(res);
          return;
        }
        return Promise.resolve(res);
      }),
      set: vi.fn((obj: Record<string, unknown>, cb?: () => void) => {
        Object.assign(_store, obj);
        if (typeof cb === 'function') {
          cb();
          return;
        }
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn((key: string, cb?: (r: Record<string, unknown>) => void) => {
        const res = { [key]: _store[key] };
        if (typeof cb === 'function') {
          cb(res);
          return;
        }
        return Promise.resolve(res);
      }),
      set: vi.fn((obj: Record<string, unknown>, cb?: () => void) => {
        Object.assign(_store, obj);
        if (typeof cb === 'function') {
          cb();
          return;
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    lastError: null as null | { message: string },
  },
};

// @ts-ignore
global.chrome = chromeMock;

export { _store };
