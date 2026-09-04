import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AkceStoreProvider, useAkceStore, useSyncStatus } from '../AkceStore';
import { FinanceSyncCoordinator } from '../financeSyncCoordinator';
import { localStorageFinanceRepository } from '../localStorageFinanceRepository';
import { FirebaseFinanceRepository } from '../firebaseFinanceRepository';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../firestoreGateway';
import type { ReactNode } from 'react';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

class SimpleGateway implements FirestoreGateway {
  docs = new Map<string, Record<string, unknown>>();
  subscriptions: { path: string; onDocuments: (documents: GatewayDocument[]) => void }[] = [];
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
    this.subscriptions.push({ path, onDocuments });
    return () => {};
  }
  subscribeDocument(_path: string, _onDocument: (doc: { id: string; data: Record<string, unknown> } | null) => void, _onError: (error: unknown) => void) { return () => {}; }
  serverTimestamp(): unknown {
    return Date.now();
  }
}

describe('AkceStoreProvider with FinanceSyncCoordinator integration', () => {
  it('provides default sync status and allows dispatching actions', () => {
    const gateway = new SimpleGateway();
    const storage = new MemoryStorage();
    const firebaseRepo = new FirebaseFinanceRepository(gateway, 'dev-1');
    const coordinator = new FinanceSyncCoordinator({
      localRepository: localStorageFinanceRepository,
      firebaseRepository: firebaseRepo,
      gateway,
      storage,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AkceStoreProvider coordinator={coordinator}>{children}</AkceStoreProvider>
    );

    const { result } = renderHook(() => ({ store: useAkceStore(), status: useSyncStatus() }), { wrapper });

    expect(result.current.status).toBe('idle');

    act(() => {
      result.current.store.dispatch({
        type: 'ADD_EXPENSE',
        payload: {
          id: 'test-hook-exp',
          amount: 450,
          category: 'Market',
          type: 'zorunlu',
          paymentMethod: 'kart',
          date: '2026-09-02',
          monthKey: '2026-09',
          createdAt: 1000,
          updatedAt: 1000,
          userId: 'local-user',
        },
      });
    });

    expect(result.current.store.state.expenses.some(e => e.id === 'test-hook-exp')).toBe(true);
  });
});
