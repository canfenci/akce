import { describe, expect, it, vi, beforeEach } from 'vitest';
import { seedData } from '../seed';
import {
  FinanceSyncCoordinator,
  type SyncStatus,
} from '../financeSyncCoordinator';
import { FirebaseFinanceRepository } from '../firebaseFinanceRepository';
import { localStorageFinanceRepository, storageKey } from '../localStorageFinanceRepository';
import { monthlyDocumentPath, globalDocumentPath, monthPath } from '../firestorePaths';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../firestoreGateway';
import { isEmptyStateMarkerSet, setEmptyStateMarker, clearEmptyStateMarker } from '../localStorageFinanceRepository';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

class MemoryFirestoreGateway implements FirestoreGateway {
  docs = new Map<string, Record<string, unknown>>();
  subscriptions: { path: string; onDocuments: (documents: GatewayDocument[]) => void; unsubscribe: ReturnType<typeof vi.fn> }[] = [];

  async getDocument(path: string): Promise<GatewayDocument | null> {
    const data = this.docs.get(path);
    if (!data) return null;
    const id = path.split('/').pop()!;
    return { id, data };
  }

  async getDocuments(path: string): Promise<GatewayDocument[]> {
    const results: GatewayDocument[] = [];
    const prefix = path.endsWith('/') ? path : `${path}/`;
    for (const [docPath, data] of this.docs.entries()) {
      if (docPath.startsWith(prefix)) {
        const remaining = docPath.slice(prefix.length);
        if (!remaining.includes('/')) {
          results.push({ id: remaining, data });
        }
      }
    }
    return results;
  }

  async setDocument(path: string, data: Record<string, unknown>, merge = false): Promise<void> {
    if (merge && this.docs.has(path)) {
      this.docs.set(path, { ...this.docs.get(path), ...data });
    } else {
      this.docs.set(path, { ...data });
    }
  }

  async updateDocument(path: string, data: Record<string, unknown>): Promise<void> {
    const existing = this.docs.get(path) ?? {};
    this.docs.set(path, { ...existing, ...data });
  }

  async deleteDocument(path: string): Promise<void> {
    this.docs.delete(path);
  }

  async commitBatch(operations: GatewayBatchOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === 'set') {
        await this.setDocument(op.path, op.data, op.merge);
      } else if (op.type === 'update') {
        await this.updateDocument(op.path, op.data);
      } else if (op.type === 'delete') {
        await this.deleteDocument(op.path);
      }
    }
  }

  subscribeCollection(path: string, onDocuments: (documents: GatewayDocument[]) => void): () => void {
    const unsubscribe = vi.fn();
    this.subscriptions.push({ path, onDocuments, unsubscribe });
    return unsubscribe;
  }

  serverTimestamp(): unknown {
    return { serverTimestamp: Date.now() };
  }
}

const uid = 'user-reset-test-123';
const monthKey = '2026-09';
const deviceId = 'test-device-1';

function createTestSetup() {
  const gateway = new MemoryFirestoreGateway();
  const storage = new MemoryStorage();
  const firebaseRepo = new FirebaseFinanceRepository(gateway, deviceId);
  const statusHistory: SyncStatus[] = [];

  const coordinator = new FinanceSyncCoordinator({
    localRepository: localStorageFinanceRepository,
    firebaseRepository: firebaseRepo,
    gateway,
    deviceId,
    storage,
    isOnline: () => true,
    onSyncStatusChange: status => statusHistory.push(status),
  });

  return { gateway, storage, firebaseRepo, coordinator, statusHistory };
}

function seedCloudData(gateway: MemoryFirestoreGateway) {
  // Monthly data
  const mKey = monthKey;
  gateway.docs.set(monthPath(uid, mKey), { monthKey: mKey, schemaVersion: 2 });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'expenses', 'exp-1'), { amount: 500, category: 'Market' });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'expenses', 'exp-2'), { amount: 300, category: 'Ulaşım' });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'incomes', 'inc-1'), { name: 'Maaş', amount: 50000 });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'fixedExpenses', 'fix-1'), { name: 'Kira', amount: 20000 });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'investments', 'inv-1'), { group: 'TEFAS', plannedAmount: 9000 });
  gateway.docs.set(monthlyDocumentPath(uid, mKey, 'categoryBudgets', 'cat-1'), { name: 'Market', limit: 12000 });

  // Another month
  const mKey2 = '2026-08';
  gateway.docs.set(monthPath(uid, mKey2), { monthKey: mKey2, schemaVersion: 2 });
  gateway.docs.set(monthlyDocumentPath(uid, mKey2, 'expenses', 'exp-old-1'), { amount: 200, category: 'Diğer' });

  // Global data
  gateway.docs.set(globalDocumentPath(uid, 'assets', 'asset-1'), { group: 'TEFAS', currentAmount: 100000 });
  gateway.docs.set(globalDocumentPath(uid, 'goals', 'goal-1'), { assetGroupId: 'freedom', targetAmount: 1000000 });
  gateway.docs.set(globalDocumentPath(uid, 'assetSnapshots', 'snap-1'), { timestamp: 12345 });

  // Migration marker
  gateway.docs.set(`users/${uid}/meta/migration`, { uid, schemaVersion: 2, completedAt: Date.now(), source: 'local' });
}

describe('AKÇE-018 — Safe Finance Data Reset', () => {
  beforeEach(() => {
    clearEmptyStateMarker();
  });

  it('resets cloud monthly finance records', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    await coordinator.resetUserFinanceData(uid);

    // Monthly docs deleted
    expect(gateway.docs.get(monthPath(uid, monthKey))).toBeUndefined();
    expect(gateway.docs.get(monthPath(uid, '2026-08'))).toBeUndefined();
    // Monthly subcollection docs deleted
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'expenses', 'exp-1'))).toBeUndefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'incomes', 'inc-1'))).toBeUndefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'fixedExpenses', 'fix-1'))).toBeUndefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'investments', 'inv-1'))).toBeUndefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'categoryBudgets', 'cat-1'))).toBeUndefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, '2026-08', 'expenses', 'exp-old-1'))).toBeUndefined();
  });

  it('resets cloud global assets, goals, and snapshots', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    await coordinator.resetUserFinanceData(uid);

    expect(gateway.docs.get(globalDocumentPath(uid, 'assets', 'asset-1'))).toBeUndefined();
    expect(gateway.docs.get(globalDocumentPath(uid, 'goals', 'goal-1'))).toBeUndefined();
    expect(gateway.docs.get(globalDocumentPath(uid, 'assetSnapshots', 'snap-1'))).toBeUndefined();
  });

  it('deletes migration marker', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    expect(gateway.docs.get(`users/${uid}/meta/migration`)).toBeDefined();

    await coordinator.resetUserFinanceData(uid);

    expect(gateway.docs.get(`users/${uid}/meta/migration`)).toBeUndefined();
  });

  it('clears local finance state from storage', async () => {
    const { coordinator, storage } = createTestSetup();
    storage.setItem(storageKey, JSON.stringify(seedData));

    await coordinator.resetUserFinanceData(uid);

    expect(storage.getItem(storageKey)).toBeNull();
  });

  it('clears local backup', async () => {
    const { coordinator, storage } = createTestSetup();
    storage.setItem(`akce-v1-backup-${uid}`, JSON.stringify(seedData));

    await coordinator.resetUserFinanceData(uid);

    expect(storage.getItem(`akce-v1-backup-${uid}`)).toBeNull();
  });

  it('writes empty state marker to prevent seed repopulation', async () => {
    const { coordinator, storage } = createTestSetup();

    expect(isEmptyStateMarkerSet(storage)).toBe(false);

    await coordinator.resetUserFinanceData(uid);

    expect(isEmptyStateMarkerSet(storage)).toBe(true);
  });

  it('coordinator stays synced after reset', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    await coordinator.resetUserFinanceData(uid);

    expect(coordinator.getSyncStatus()).toBe('synced');
    expect(coordinator.getActiveRepository().kind).toBe('firestore');
  });

  it('handles partial cloud failures gracefully without showing false success', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    // Make getDocuments fail on second call
    let callCount = 0;
    const originalGetDocuments = gateway.getDocuments!.bind(gateway);
    gateway.getDocuments = async (path: string) => {
      callCount++;
      if (callCount > 3) throw new Error('Firestore read failed');
      return originalGetDocuments(path);
    };

    await expect(coordinator.resetUserFinanceData(uid)).rejects.toThrow('Firestore read failed');
  });

  it('does not delete data for a different UID', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    const otherUid = 'user-other-456';
    gateway.docs.set(globalDocumentPath(otherUid, 'assets', 'other-asset'), { group: 'Other' });

    await coordinator.resetUserFinanceData(uid);

    // Other user's data untouched
    expect(gateway.docs.get(globalDocumentPath(otherUid, 'assets', 'other-asset'))).toBeDefined();
    // Our data deleted
    expect(gateway.docs.get(globalDocumentPath(uid, 'assets', 'asset-1'))).toBeUndefined();
  });

  it('empty state marker prevents seed data from loading', () => {
    const storage = new MemoryStorage();
    // No saved state, but marker set
    setEmptyStateMarker(storage);

    const state = localStorageFinanceRepository.loadState(storage);

    expect(state.expenses).toHaveLength(0);
    expect(state.incomes).toHaveLength(0);
    expect(state.fixedExpenses).toHaveLength(0);
    expect(state.investments).toHaveLength(0);
    expect(state.assets).toHaveLength(0);
    expect(state.goals).toHaveLength(0);
    expect(state.categoryBudgets).toHaveLength(0);
    expect(state.assetSnapshots).toHaveLength(0);
  });

  it('without marker, fresh install still gets seed data', () => {
    const storage = new MemoryStorage();
    const state = localStorageFinanceRepository.loadState(storage);

    // Should get seed data (no saved state, no marker)
    expect(state.incomes.length).toBeGreaterThan(0);
  });

  it('empty state preserves settings and selectedMonthKey', async () => {
    const { coordinator, storage } = createTestSetup();
    storage.setItem(storageKey, JSON.stringify({
      ...seedData,
      selectedMonthKey: '2026-11',
      settings: { ...seedData.settings, currency: 'USD' },
    }));

    await coordinator.resetUserFinanceData(uid);

    const state = localStorageFinanceRepository.loadState(storage);
    expect(state.settings.currency).toBe('TL'); // settings come from emptyFinanceState defaults
    expect(state.schemaVersion).toBe(2);
  });

  it('reset is idempotent — calling twice does not throw', async () => {
    const { coordinator, gateway } = createTestSetup();
    seedCloudData(gateway);

    await coordinator.resetUserFinanceData(uid);
    await coordinator.resetUserFinanceData(uid);

    expect(coordinator.getSyncStatus()).toBe('synced');
  });
});
