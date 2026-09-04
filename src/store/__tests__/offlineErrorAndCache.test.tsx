import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { normalizeError } from '../errorNormalization';
import {
  getIsDeviceTrusted,
  setIsDeviceTrusted,
  getPreferredCacheMode,
  TRUSTED_DEVICE_KEY,
} from '../devicePreference';
import { FinanceSyncCoordinator } from '../financeSyncCoordinator';
import { FirebaseFinanceRepository } from '../firebaseFinanceRepository';
import { localStorageFinanceRepository } from '../localStorageFinanceRepository';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../firestoreGateway';
import type { AkceData } from '../seed';
import { seedData } from '../seed';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

class FakeOfflineGateway implements FirestoreGateway {
  docs = new Map<string, Record<string, unknown>>();
  subscriptions: { path: string; onDocuments: (documents: GatewayDocument[]) => void; unsubscribe: ReturnType<typeof vi.fn> }[] = [];
  async getDocument(path: string): Promise<GatewayDocument | null> {
    const data = this.docs.get(path);
    return data ? { id: path.split('/').pop()!, data } : null;
  }
  async getDocuments(): Promise<GatewayDocument[]> {
    return [];
  }
  async setDocument(path: string, data: Record<string, unknown>): Promise<void> {
    this.docs.set(path, data);
  }
  async updateDocument(path: string, data: Record<string, unknown>): Promise<void> {
    this.docs.set(path, { ...this.docs.get(path), ...data });
  }
  async deleteDocument(path: string): Promise<void> {
    this.docs.delete(path);
  }
  async commitBatch(operations: GatewayBatchOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === 'set') this.docs.set(op.path, op.data);
      else if (op.type === 'update') this.docs.set(op.path, { ...this.docs.get(op.path), ...op.data });
      else this.docs.delete(op.path);
    }
  }
  subscribeCollection(path: string, onDocuments: (documents: GatewayDocument[]) => void): () => void {
    const unsubscribe = vi.fn();
    this.subscriptions.push({ path, onDocuments, unsubscribe });
    return unsubscribe;
  }
  subscribeDocument(_path: string, _onDocument: (doc: { id: string; data: Record<string, unknown> } | null) => void, _onError: (error: unknown) => void) { return () => {}; }
  serverTimestamp(): unknown {
    return Date.now();
  }
}

function BrokenComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Component exploded');
  }
  return <div>Component content</div>;
}

describe('Offline, Error Normalization, Cache and Boundary Hardening', () => {
  describe('CACHE PREFERENCE', () => {
    it('defaults to trusted device and persistent cache mode', () => {
      const storage = new MemoryStorage();
      expect(getIsDeviceTrusted(storage)).toBe(true);
      expect(getPreferredCacheMode(storage)).toBe('persistent');
    });

    it('sets shared device and switches to memory cache mode', () => {
      const storage = new MemoryStorage();
      setIsDeviceTrusted(false, storage);
      expect(storage.getItem(TRUSTED_DEVICE_KEY)).toBe('shared');
      expect(getIsDeviceTrusted(storage)).toBe(false);
      expect(getPreferredCacheMode(storage)).toBe('memory');
    });

    it('survives preference across simulated restart', () => {
      const storage = new MemoryStorage();
      setIsDeviceTrusted(false, storage);
      // Restart simulation
      const newStorageSession = storage;
      expect(getIsDeviceTrusted(newStorageSession)).toBe(false);
      expect(getPreferredCacheMode(newStorageSession)).toBe('memory');
    });
  });

  describe('ERROR NORMALIZATION', () => {
    it('normalizes permission-denied errors into user-friendly message', () => {
      const err = normalizeError({ code: 'permission-denied' });
      expect(err.kind).toBe('permission-denied');
      expect(err.userMessage).toContain('yetkiniz');
    });

    it('normalizes network unavailable errors into offline message', () => {
      const err = normalizeError({ code: 'unavailable' });
      expect(err.kind).toBe('network-unavailable');
      expect(err.userMessage).toContain('Çevrimdışı');
    });

    it('normalizes auth token expired errors', () => {
      const err = normalizeError({ code: 'auth/user-token-expired' });
      expect(err.kind).toBe('auth-expired');
      expect(err.userMessage).toContain('Oturum süresi doldu');
    });

    it('normalizes sync conflict errors', () => {
      const err = normalizeError(new Error('Document conflict'));
      expect(err.kind).toBe('sync-conflict');
      expect(err.userMessage).toContain('çakışması');
    });

    it('normalizes unknown errors gracefully without technical leakage', () => {
      const err = normalizeError(new Error('Internal unexpected socket closed'));
      expect(err.kind).toBe('unknown');
      expect(err.userMessage).toContain('Beklenmedik bir sorun');
    });
  });

  describe('ROOT ERROR BOUNDARY', () => {
    it('renders children when there is no error', () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldThrow={false} />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Component content')).toBeDefined();
    });

    it('catches render error and displays calm Akçe fallback UI with retry button', () => {
      // Suppress React console.error during expected thrown error test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { rerender } = render(
        <ErrorBoundary>
          <BrokenComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Akçe beklenmedik bir sorunla karşılaştı.')).toBeDefined();
      expect(screen.getByText('Tekrar dene')).toBeDefined();

      // Clicking retry recovers if component no longer throws
      rerender(
        <ErrorBoundary>
          <BrokenComponent shouldThrow={false} />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByText('Tekrar dene'));
      expect(screen.getByText('Component content')).toBeDefined();

      spy.mockRestore();
    });
  });

  describe('SYNC: RECONNECT & LIFECYCLE CONVERGENCE', () => {
    it('converges from offline to online without re-running migration', async () => {
      const gateway = new FakeOfflineGateway();
      const storage = new MemoryStorage();
      const firebaseRepo = new FirebaseFinanceRepository(gateway, 'device-1');

      let online = false;
      const coordinator = new FinanceSyncCoordinator({
        localRepository: localStorageFinanceRepository,
        firebaseRepository: firebaseRepo,
        gateway,
        storage,
        isOnline: () => online,
      });

      const localState: AkceData = {
        ...seedData,
        expenses: [
          ...seedData.expenses,
          {
            id: 'exp-conv-1',
            amount: 75,
            category: 'Market',
            type: 'zorunlu',
            paymentMethod: 'kart',
            date: '2026-09-02',
            monthKey: '2026-09',
            createdAt: 1000,
            updatedAt: 1000,
            userId: 'local-user',
          },
        ],
      };

      // 1. Initial attempt while offline
      await coordinator.handleAuthChange({ uid: 'user-reconnect' }, '2026-09', localState);
      expect(coordinator.getSyncStatus()).toBe('offline');

      // 2. Network reconnects
      online = true;
      await coordinator.handleAuthChange({ uid: 'user-reconnect' }, '2026-09', localState);
      expect(coordinator.getSyncStatus()).toBe('synced');
      expect(coordinator.getActiveRepository().kind).toBe('firestore');

      // 3. Repeating auth change retains synced status and migration marker
      const markerBefore = gateway.docs.get('users/user-reconnect/meta/migration');
      await coordinator.handleAuthChange({ uid: 'user-reconnect' }, '2026-09', localState);
      const markerAfter = gateway.docs.get('users/user-reconnect/meta/migration');
      expect(markerAfter?.completedAt).toBe(markerBefore?.completedAt);

      // 4. Sign-out cleanup
      await coordinator.handleAuthChange(null, '2026-09');
      expect(coordinator.getActiveRepository().kind).toBe('local');
      expect(coordinator.getSyncStatus()).toBe('idle');
      expect(gateway.subscriptions.every(s => s.unsubscribe.mock.calls.length >= 1)).toBe(true);
    });
  });
});
