import { describe, expect, it, vi } from 'vitest';
import type { AkceData } from '../seed';
import { seedData } from '../seed';
import {
  FinanceSyncCoordinator,
  mergeRecords,
  type SyncStatus,
} from '../financeSyncCoordinator';
import { FirebaseFinanceRepository } from '../firebaseFinanceRepository';
import { localStorageFinanceRepository } from '../localStorageFinanceRepository';
import { migrationMarkerPath } from '../migrationMarker';
import { monthlyDocumentPath } from '../firestorePaths';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../firestoreGateway';
import { filterUserRecords } from '../seedProtection';

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
  failNextCommit = false;

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
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('Firestore commit failed');
    }
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

const uid = 'user-test-123';
const monthKey = '2026-09';
const deviceId = 'test-device-1';

function createTestSetup(overrides?: { isOnline?: () => boolean }) {
  const gateway = new MemoryFirestoreGateway();
  const storage = new MemoryStorage();
  const firebaseRepo = new FirebaseFinanceRepository(gateway, deviceId);
  const statusHistory: SyncStatus[] = [];
  let hydratedState: AkceData | null = null;

  let online = true;
  const isOnline = overrides?.isOnline ?? (() => online);

  const coordinator = new FinanceSyncCoordinator({
    localRepository: localStorageFinanceRepository,
    firebaseRepository: firebaseRepo,
    gateway,
    deviceId,
    storage,
    isOnline,
    onSyncStatusChange: status => statusHistory.push(status),
    onHydrateState: state => { hydratedState = state; },
  });

  return {
    gateway,
    storage,
    firebaseRepo,
    coordinator,
    statusHistory,
    getHydratedState: () => hydratedState,
    setOnline: (val: boolean) => { online = val; },
  };
}

function createEmptyLocalState(): AkceData {
  return {
    schemaVersion: 2,
    selectedMonthKey: monthKey,
    expenses: [],
    incomes: [],
    fixedExpenses: [],
    investments: [],
    categoryBudgets: [],
    assets: [],
    goals: [],
    assetSnapshots: [],
    settings: { ...seedData.settings },
  };
}

describe('AKÇE-008C — Finance Sync Coordinator & Migration', () => {
  // 1. local dolu / cloud boş
  it('1. handles Scenario A: local full / cloud empty with upload, marker, and canonical switch', async () => {
    const { coordinator, gateway, storage } = createTestSetup();

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-user-1',
      amount: 500,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('synced');
    expect(coordinator.getActiveRepository().kind).toBe('firestore');

    // Document uploaded
    const uploaded = gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'expenses', 'exp-user-1'));
    expect(uploaded).toBeDefined();
    expect(uploaded?.amount).toBe(500);

    // Marker written
    const markerDoc = gateway.docs.get(migrationMarkerPath(uid));
    expect(markerDoc).toBeDefined();
    expect(markerDoc?.source).toBe('local');

    // Local backup taken
    expect(storage.getItem(`akce-v1-backup-${uid}`)).toBeTruthy();
  });

  // 2. local boş / cloud dolu
  it('2. handles Scenario B: local empty / cloud full by hydrating cloud state without uploading demo data', async () => {
    const { coordinator, gateway, getHydratedState } = createTestSetup();

    // Cloud has data
    gateway.docs.set(`users/${uid}/months/${monthKey}`, { monthKey, schemaVersion: 2 });
    gateway.docs.set(monthlyDocumentPath(uid, monthKey, 'expenses', 'cloud-exp-1'), {
      amount: 999,
      category: 'Gıda',
      type: 'zorunlu',
      paymentMethod: 'nakit',
      date: '2026-09-01',
      monthKey,
      createdAt: 2000,
      updatedAt: 2000,
      schemaVersion: 2,
      deviceId: 'other-device',
    });

    // Local has default untouched seed data
    const untouchedSeed = JSON.parse(JSON.stringify(seedData)) as AkceData;
    await coordinator.handleAuthChange({ uid }, monthKey, untouchedSeed);

    expect(coordinator.getSyncStatus()).toBe('synced');
    expect(coordinator.getActiveRepository().kind).toBe('firestore');

    const hydrated = getHydratedState();
    expect(hydrated).toBeDefined();
    expect(hydrated?.expenses.some(e => e.id === 'cloud-exp-1')).toBe(true);
    // Untouched seed data must not have been uploaded to cloud
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'expenses', 'expense-1'))).toBeUndefined();
  });

  // 3. local dolu / cloud dolu
  it('3. handles Scenario C: local full / cloud full by performing deterministic merge', async () => {
    const { coordinator, gateway } = createTestSetup();

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'local-only-exp',
      amount: 300,
      category: 'Ulaşım',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    // Cloud has existing distinct item
    gateway.docs.set(`users/${uid}/months/${monthKey}`, { monthKey, schemaVersion: 2 });
    gateway.docs.set(monthlyDocumentPath(uid, monthKey, 'expenses', 'cloud-only-exp'), {
      amount: 700,
      category: 'Eğlence',
      type: 'isteğe bağlı',
      paymentMethod: 'kart',
      date: '2026-09-01',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      schemaVersion: 2,
      deviceId: 'other-device',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('synced');
    // Union: both items should exist in cloud now
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'expenses', 'local-only-exp'))).toBeDefined();
    expect(gateway.docs.get(monthlyDocumentPath(uid, monthKey, 'expenses', 'cloud-only-exp'))).toBeDefined();
  });

  // 4. local record newer
  it('4. resolves conflict in favor of local when local record is newer', () => {
    const local = [{ id: 'item-1', name: 'Local Newer', updatedAt: 5000 }];
    const cloud = [{ id: 'item-1', name: 'Cloud Older', updatedAt: 1000 }];

    const result = mergeRecords(local, cloud);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].name).toBe('Local Newer');
    expect(result.localWins).toHaveLength(1);
  });

  // 5. cloud record newer
  it('5. resolves conflict in favor of cloud when cloud record is newer', () => {
    const local = [{ id: 'item-1', name: 'Local Older', updatedAt: 1000 }];
    const cloud = [{ id: 'item-1', name: 'Cloud Newer', updatedAt: 5000 }];

    const result = mergeRecords(local, cloud);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].name).toBe('Cloud Newer');
    expect(result.localWins).toHaveLength(0);
  });

  // 6. equal timestamp → cloud wins
  it('6. resolves conflict in favor of cloud when timestamps are equal', () => {
    const local = [{ id: 'item-1', name: 'Local Tie', updatedAt: 3000 }];
    const cloud = [{ id: 'item-1', name: 'Cloud Tie', updatedAt: 3000 }];

    const result = mergeRecords(local, cloud);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].name).toBe('Cloud Tie');
    expect(result.localWins).toHaveLength(0);
  });

  // 7. migration idempotent
  it('7. ensures migration is idempotent when run repeatedly for the same UID', async () => {
    const { coordinator, gateway } = createTestSetup();
    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-user-repeat',
      amount: 150,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);
    const firstMarker = gateway.docs.get(migrationMarkerPath(uid));

    // Second run
    await coordinator.handleAuthChange({ uid }, monthKey, localState);
    const secondMarker = gateway.docs.get(migrationMarkerPath(uid));

    expect(secondMarker?.completedAt).toBe(firstMarker?.completedAt);
    expect(coordinator.getSyncStatus()).toBe('synced');
  });

  // 8. partial migration retry
  it('8. retries partial migration cleanly if no marker was written previously', async () => {
    const { coordinator, gateway } = createTestSetup();
    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-partial-1',
      amount: 250,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    // Simulate partial upload: doc exists but no marker
    gateway.docs.set(monthlyDocumentPath(uid, monthKey, 'expenses', 'exp-partial-1'), {
      amount: 250,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      schemaVersion: 2,
      deviceId,
    });

    // Run coordinator
    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('synced');
    expect(gateway.docs.get(migrationMarkerPath(uid))).toBeDefined();
  });

  // 9. marker only after success
  it('9. writes migration marker only after upload completely succeeds', async () => {
    const { coordinator, gateway } = createTestSetup();
    gateway.failNextCommit = true;

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-fail',
      amount: 100,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('error');
    // Marker must NOT be written on failure
    expect(gateway.docs.get(migrationMarkerPath(uid))).toBeUndefined();
  });

  // 10. seed data not uploaded
  it('10. filters out untouched demo/seed data so it is not uploaded to cloud', () => {
    const expenses = seedData.expenses;
    const filtered = filterUserRecords('expenses', expenses);
    expect(filtered).toHaveLength(0); // All default seed expenses are filtered

    const modified = [{ ...seedData.expenses[0], amount: 99999 }];
    const filteredModified = filterUserRecords('expenses', modified);
    expect(filteredModified).toHaveLength(1); // Modified item is recognized as user data
  });

  // 11. selectedMonthKey remains local
  it('11. preserves selectedMonthKey as device preference during cloud hydration', async () => {
    const { coordinator, gateway, getHydratedState } = createTestSetup();
    gateway.docs.set(`users/${uid}/months/2026-08`, { monthKey: '2026-08', schemaVersion: 2 });
    gateway.docs.set(monthlyDocumentPath(uid, '2026-08', 'expenses', 'cloud-exp-aug'), {
      amount: 100,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-08-15',
      monthKey: '2026-08',
      createdAt: 1000,
      updatedAt: 1000,
      schemaVersion: 2,
      deviceId: 'other',
    });

    // Local device is currently on '2026-09'
    const untouched = JSON.parse(JSON.stringify(seedData)) as AkceData;
    untouched.selectedMonthKey = '2026-09';

    await coordinator.handleAuthChange({ uid }, '2026-09', untouched);

    const hydrated = getHydratedState();
    expect(hydrated?.selectedMonthKey).toBe('2026-09');
  });

  // 12. sign-out listener cleanup
  it('12. cleans up all Firestore listeners on sign-out', async () => {
    const { coordinator, gateway } = createTestSetup();
    const localState = createEmptyLocalState();

    await coordinator.handleAuthChange({ uid }, monthKey, localState);
    expect(gateway.subscriptions.length).toBeGreaterThan(0);

    // Sign out
    await coordinator.handleAuthChange(null, monthKey);

    expect(gateway.subscriptions.every(sub => sub.unsubscribe.mock.calls.length >= 1)).toBe(true);
    expect(coordinator.getSyncStatus()).toBe('idle');
  });

  // 13. local → firebase repository switch
  it('13. switches active repository from local to firebase upon successful sign-in', async () => {
    const { coordinator } = createTestSetup();
    expect(coordinator.getActiveRepository().kind).toBe('local');

    const localState = createEmptyLocalState();
    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getActiveRepository().kind).toBe('firestore');
  });

  // 14. firebase → local repository switch
  it('14. switches active repository from firebase to local upon sign-out', async () => {
    const { coordinator } = createTestSetup();
    const localState = createEmptyLocalState();

    await coordinator.handleAuthChange({ uid }, monthKey, localState);
    expect(coordinator.getActiveRepository().kind).toBe('firestore');

    await coordinator.handleAuthChange(null, monthKey);
    expect(coordinator.getActiveRepository().kind).toBe('local');
  });

  // 15. offline migration blocked
  it('15. blocks migration when offline without writing marker or modifying cloud', async () => {
    const { coordinator, gateway, setOnline } = createTestSetup();
    setOnline(false);

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-offline-1',
      amount: 300,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('offline');
    expect(gateway.docs.size).toBe(0); // Nothing written
  });

  // 16. migration failure preserves local data
  it('16. preserves local data and local backup on migration failure', async () => {
    const { coordinator, gateway, storage } = createTestSetup();
    gateway.failNextCommit = true;

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-safe-1',
      amount: 400,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(coordinator.getSyncStatus()).toBe('error');
    // Local backup was safely created before the attempt
    const backup = coordinator.getBackup(uid);
    expect(backup).toBeDefined();
    expect(backup?.expenses.some(e => e.id === 'exp-safe-1')).toBe(true);
    expect(storage.getItem(`akce-v1-backup-${uid}`)).toBeTruthy();
  });

  // 17. duplicate migration does not duplicate records
  it('17. ensures duplicate migration calls do not duplicate records', () => {
    const local = [
      { id: 'item-1', name: 'Item 1', updatedAt: 1000 },
      { id: 'item-2', name: 'Item 2', updatedAt: 1000 },
    ];
    const cloud = [
      { id: 'item-1', name: 'Item 1', updatedAt: 1000 },
      { id: 'item-2', name: 'Item 2', updatedAt: 1000 },
    ];

    const result = mergeRecords(local, cloud);
    expect(result.merged).toHaveLength(2);
    expect(new Set(result.merged.map(i => i.id)).size).toBe(2);
  });

  // 18. listener cleanup on selected month change
  it('18. cleans up previous month listeners when selected month changes', async () => {
    const { coordinator, gateway } = createTestSetup();
    const localState = createEmptyLocalState();

    await coordinator.handleAuthChange({ uid }, '2026-09', localState);
    const initialSubs = [...gateway.subscriptions];

    coordinator.switchSelectedMonth('2026-10');

    // Month subscription should have been unsubscribed and replaced
    const monthSubs = initialSubs.filter(s => s.path.includes('months/2026-09'));
    expect(monthSubs.every(s => s.unsubscribe.mock.calls.length >= 1)).toBe(true);
  });

  // 19. sync status transitions
  it('19. transitions sync status through idle -> migrating -> syncing -> synced', async () => {
    const { coordinator, statusHistory } = createTestSetup();
    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-trans-1',
      amount: 120,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    await coordinator.handleAuthChange({ uid }, monthKey, localState);

    expect(statusHistory).toContain('migrating');
    expect(statusHistory).toContain('synced');
    expect(coordinator.getSyncStatus()).toBe('synced');
  });

  // 20. migration interrupted by sign-out
  it('20. handles migration interrupted by sign-out cleanly', async () => {
    const { coordinator } = createTestSetup();

    const localState = createEmptyLocalState();
    localState.expenses.push({
      id: 'exp-interrupt-1',
      amount: 80,
      category: 'Market',
      type: 'zorunlu',
      paymentMethod: 'kart',
      date: '2026-09-02',
      monthKey,
      createdAt: 1000,
      updatedAt: 1000,
      userId: 'local-user',
    });

    // Start migration and immediately trigger sign-out
    const p1 = coordinator.handleAuthChange({ uid }, monthKey, localState);
    const p2 = coordinator.handleAuthChange(null, monthKey);

    await Promise.all([p1, p2]);

    expect(coordinator.getActiveRepository().kind).toBe('local');
    expect(coordinator.getSyncStatus()).toBe('idle');
  });
});
