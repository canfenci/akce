import type { FirestoreCacheMode } from '../firebase/firebaseFirestore';

export const TRUSTED_DEVICE_KEY = 'akce-v1-device-trusted';

export function getIsDeviceTrusted(storage: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage)): boolean {
  try {
    const val = storage.getItem?.(TRUSTED_DEVICE_KEY);
    // Default to true (trusted/personal device) unless explicitly set to 'shared'
    return val !== 'shared';
  } catch {
    return true;
  }
}

export function setIsDeviceTrusted(trusted: boolean, storage: Storage = typeof localStorage !== 'undefined' ? localStorage : ({} as Storage)): void {
  try {
    storage.setItem?.(TRUSTED_DEVICE_KEY, trusted ? 'trusted' : 'shared');
  } catch {
    // Ignore storage quota issues
  }
}

export function getPreferredCacheMode(storage?: Storage): FirestoreCacheMode {
  return getIsDeviceTrusted(storage) ? 'persistent' : 'memory';
}
