import { describe, expect, it, vi } from 'vitest';
import { seedData } from '../seed';
import { FirebaseFinanceRepository } from '../firebaseFinanceRepository';
import { fromFirestoreDto, toFirestoreDto } from '../firestoreFinanceMappers';
import { globalCollectionPath, globalDocumentPath, monthPath, monthlyCollectionPath, monthlyDocumentPath } from '../firestorePaths';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../firestoreGateway';

class FakeGateway implements FirestoreGateway {
  subscriptions: { path: string; onDocuments: (documents: GatewayDocument[]) => void; unsubscribe: ReturnType<typeof vi.fn> }[] = [];
  sets: { path: string; data: Record<string, unknown>; merge?: boolean }[] = [];
  updates: { path: string; data: Record<string, unknown> }[] = [];
  deletes: string[] = [];
  batches: GatewayBatchOperation[][] = [];
  readonly timestamp = { kind: 'server-timestamp' };

  subscribeCollection(path: string, onDocuments: (documents: GatewayDocument[]) => void) {
    const unsubscribe = vi.fn();
    this.subscriptions.push({ path, onDocuments, unsubscribe });
    return unsubscribe;
  }
  async setDocument(path: string, data: Record<string, unknown>, merge?: boolean) { this.sets.push({ path, data, merge }); }
  async updateDocument(path: string, data: Record<string, unknown>) { this.updates.push({ path, data }); }
  async deleteDocument(path: string) { this.deletes.push(path); }
  async commitBatch(operations: GatewayBatchOperation[]) { this.batches.push(operations); }
  serverTimestamp() { return this.timestamp; }
}

const uid = 'user-1';
const monthKey = '2026-09';
const deviceId = 'device-1';
const createRepository = () => {
  const gateway = new FakeGateway();
  return { gateway, repository: new FirebaseFinanceRepository(gateway, deviceId) };
};

describe('Firestore finance repository', () => {
  it('generates the required user, month, collection and document paths', () => {
    expect(monthPath(uid, monthKey)).toBe('users/user-1/months/2026-09');
    expect(monthlyCollectionPath(uid, monthKey, 'expenses')).toBe('users/user-1/months/2026-09/expenses');
    expect(monthlyDocumentPath(uid, monthKey, 'expenses', 'expense-1')).toBe('users/user-1/months/2026-09/expenses/expense-1');
    expect(globalDocumentPath(uid, 'assets', 'asset-1')).toBe('users/user-1/assets/asset-1');
  });

  it('maps a Firestore DTO into a domain object without Firebase metadata', () => {
    const source = { ...seedData.expenses[0], monthKey };
    const dto = toFirestoreDto(source, deviceId, { server: true });
    const domain = fromFirestoreDto('expenses', source.id, uid, dto);
    expect(domain).toEqual({ ...source, userId: uid });
    expect(domain).not.toHaveProperty('deviceId');
    expect(domain).not.toHaveProperty('serverUpdatedAt');
    expect(domain).not.toHaveProperty('schemaVersion');
  });

  it('maps a domain object into a DTO without document id or user id', () => {
    const dto = toFirestoreDto({ ...seedData.incomes[0], monthKey }, deviceId, { server: true }, 10);
    expect(dto).not.toHaveProperty('id');
    expect(dto).not.toHaveProperty('userId');
    expect(dto).toMatchObject({ monthKey, schemaVersion: 2, deviceId, serverUpdatedAt: { server: true } });
  });

  it('subscribes only to the five collections of the selected month', () => {
    const { gateway, repository } = createRepository();
    repository.subscribeSelectedMonth(uid, monthKey, vi.fn(), vi.fn());
    expect(gateway.subscriptions.map(item => item.path)).toEqual([
      'users/user-1/months/2026-09/expenses',
      'users/user-1/months/2026-09/incomes',
      'users/user-1/months/2026-09/fixedExpenses',
      'users/user-1/months/2026-09/investments',
      'users/user-1/months/2026-09/categoryBudgets',
    ]);
  });

  it('subscribes globally to assets, goals and asset snapshots', () => {
    const { gateway, repository } = createRepository();
    repository.subscribeGlobals(uid, vi.fn(), vi.fn());
    expect(gateway.subscriptions.map(item => item.path)).toEqual([
      globalCollectionPath(uid, 'assets'),
      globalCollectionPath(uid, 'goals'),
      globalCollectionPath(uid, 'assetSnapshots'),
    ]);
  });

  it('cleans selected-month listeners and disposes all remaining listeners once', () => {
    const { gateway, repository } = createRepository();
    const cleanupMonth = repository.subscribeSelectedMonth(uid, monthKey, vi.fn(), vi.fn());
    repository.subscribeGlobals(uid, vi.fn(), vi.fn());
    cleanupMonth();
    cleanupMonth();
    repository.dispose();
    expect(gateway.subscriptions.every(item => item.unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it('creates an expense document at its domain id', async () => {
    const { gateway, repository } = createRepository();
    const expense = { ...seedData.expenses[0], monthKey };
    await repository.applyMutation(uid, { type: 'expense.create', value: expense });
    expect(gateway.sets[0].path).toBe(monthlyDocumentPath(uid, monthKey, 'expenses', expense.id));
    expect(gateway.sets[0].data).toMatchObject({ amount: expense.amount, deviceId, schemaVersion: 2 });
  });

  it('updates only the selected income document', async () => {
    const { gateway, repository } = createRepository();
    const income = { ...seedData.incomes[0], monthKey, amount: 120000 };
    await repository.applyMutation(uid, { type: 'income.update', value: income });
    expect(gateway.updates[0].path).toBe(monthlyDocumentPath(uid, monthKey, 'incomes', income.id));
    expect(gateway.updates[0].data).toMatchObject({ amount: 120000, deviceId });
  });

  it('writes a fixed-expense toggle as a field-level mutation', async () => {
    const { gateway, repository } = createRepository();
    await repository.applyMutation(uid, { type: 'fixedExpense.toggle', monthKey, id: 'fixed-1', active: false, updatedAt: 20 });
    expect(gateway.updates[0]).toMatchObject({ path: monthlyDocumentPath(uid, monthKey, 'fixedExpenses', 'fixed-1'), data: { active: false, updatedAt: 20 } });
  });

  it('updates an investment document without writing all finance state', async () => {
    const { gateway, repository } = createRepository();
    const investment = { ...seedData.investments[0], monthKey, plannedAmount: 15000 };
    await repository.applyMutation(uid, { type: 'investment.update', value: investment });
    expect(gateway.updates).toHaveLength(1);
    expect(gateway.updates[0].path).toBe(monthlyDocumentPath(uid, monthKey, 'investments', investment.id));
  });

  it('deletes only the requested category budget document', async () => {
    const { gateway, repository } = createRepository();
    await repository.applyMutation(uid, { type: 'categoryBudget.delete', monthKey, id: 'cat-1' });
    expect(gateway.deletes).toEqual([monthlyDocumentPath(uid, monthKey, 'categoryBudgets', 'cat-1')]);
  });

  it('updates a global asset document', async () => {
    const { gateway, repository } = createRepository();
    const asset = { ...seedData.assets[0], currentAmount: 200000 };
    await repository.applyMutation(uid, { type: 'asset.update', value: asset });
    expect(gateway.updates[0].path).toBe(globalDocumentPath(uid, 'assets', asset.id));
    expect(gateway.updates[0].data).toMatchObject({ currentAmount: 200000, deviceId });
  });

  it('initializes a month with one metadata document and document-level batch sets', async () => {
    const { gateway, repository } = createRepository();
    const income = { ...seedData.incomes[0], monthKey };
    await repository.applyMutation(uid, { type: 'month.initialize', value: { monthKey, incomes: [income], fixedExpenses: [], investments: [], categoryBudgets: [] } });
    expect(gateway.batches).toHaveLength(1);
    expect(gateway.batches[0].map(operation => operation.path)).toEqual([monthPath(uid, monthKey), monthlyDocumentPath(uid, monthKey, 'incomes', income.id)]);
  });

  it('normalizes raw Firestore errors at the repository boundary', async () => {
    const { gateway, repository } = createRepository();
    vi.spyOn(gateway, 'updateDocument').mockRejectedValue({ code: 'permission-denied' });
    const income = { ...seedData.incomes[0], monthKey };
    await expect(repository.applyMutation(uid, { type: 'income.update', value: income })).rejects.toMatchObject({ kind: 'permission-denied', message: 'Firestore erişim izni reddedildi.' });
  });
});
