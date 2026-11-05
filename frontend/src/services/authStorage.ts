import { LazyStore } from '@tauri-apps/plugin-store';
import type { StateStorage } from 'zustand/middleware';

export const AUTH_KEYS = ['cafe-auth', 'cafe_token', 'cafe-user'] as const;

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

// The store file lives in the app data dir, so auth survives app restarts
// and webview teardown; the server-side session is the real expiry boundary.
const store = isTauri() ? new LazyStore('auth.json') : null;

// StateStorage adapter: Tauri store plugin inside the desktop app,
// localStorage in a plain browser (dev/web builds).
export const authStorage: StateStorage = {
  getItem: async (name) => {
    if (!store) return localStorage.getItem(name);
    const value = await store.get<string>(name);
    if (value != null) return value;
    // One-time migration for auth written to web storage by older builds.
    const legacy =
      localStorage.getItem(name) ?? sessionStorage.getItem(name);
    if (legacy != null) {
      await store.set(name, legacy);
      await store.save();
    }
    return legacy;
  },
  setItem: async (name, value) => {
    if (!store) {
      localStorage.setItem(name, value);
      return;
    }
    await store.set(name, value);
    await store.save();
    // Keep web storage clear so it can't shadow the store file on read.
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
  removeItem: async (name) => {
    if (!store) {
      localStorage.removeItem(name);
      return;
    }
    await store.delete(name);
    await store.save();
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};
