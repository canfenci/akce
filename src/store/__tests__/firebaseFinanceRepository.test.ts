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

  describe('AKCE-034: asset DTO round-trip', () => {
    const uid = 'user-1';
    const deviceId = 'device-1';
    const timestamp = { server: true };

    it('quantity asset round-trips through DTO', () => {
      const asset = { id: 'a1', group: 'Altın' as const, name: 'Gram Altın', valuationMode: 'quantity' as const, quantity: 125.5, unit: 'Gram' as const, unitPrice: 3100, currentAmount: 389050, targetAmount: 500000, createdAt: 1, updatedAt: 1, userId: uid };
      const dto = toFirestoreDto(asset, deviceId, timestamp);
      const domain = fromFirestoreDto('assets', 'a1', uid, dto as Record<string, unknown>);
      expect(domain.name).toBe('Gram Altın');
      expect(domain.valuationMode).toBe('quantity');
      expect(domain.quantity).toBe(125.5);
      expect(domain.unit).toBe('Gram');
      expect(domain.unitPrice).toBe(3100);
      expect(domain.currentAmount).toBe(389050);
    });

    it('direct asset round-trips through DTO and normalizes to quantity model', () => {
      const asset = { id: 'a2', group: 'BES' as const, name: 'Allianz BES', valuationMode: 'direct' as const, currentAmount: 64300, targetAmount: 200000, createdAt: 1, updatedAt: 1, userId: uid };
      const dto = toFirestoreDto(asset, deviceId, timestamp);
      const domain = fromFirestoreDto('assets', 'a2', uid, dto as Record<string, unknown>);
      expect(domain.name).toBe('Allianz BES');
      expect(domain.valuationMode).toBe('direct');
      expect(domain.quantity).toBe(1);
      expect(domain.unit).toBe('Adet');
      expect(domain.unitPrice).toBe(64300);
      expect(domain.currentAmount).toBe(64300);
    });

    it('old Firestore document without name/valuationMode normalizes to quantity model', () => {
      const oldDto = { group: 'TEFAS', currentAmount: 132000, targetAmount: 200000, schemaVersion: 2, deviceId: 'old', createdAt: 1, updatedAt: 1, serverUpdatedAt: timestamp };
      const domain = fromFirestoreDto('assets', 'a1', uid, oldDto);
      expect(domain.name).toBe('');
      expect(domain.valuationMode).toBe('direct');
      expect(domain.quantity).toBe(1);
      expect(domain.unit).toBe('Adet');
      expect(domain.unitPrice).toBe(132000);
      expect(domain.currentAmount).toBe(132000);
    });

    it('allowed group enum includes new values', () => {
      const groups = ['TEFAS', 'Nasdaq', 'Altın', 'Gümüş', 'BES', 'Nakit', 'Mevduat', 'Kripto', 'Diğer', 'BIST Hisse', 'Döviz', 'Eurobond / Tahvil'] as const;
      for (const group of groups) {
        const asset = { id: 'a1', group, name: 'Test', valuationMode: 'direct' as const, currentAmount: 100, targetAmount: 200, createdAt: 1, updatedAt: 1, userId: uid };
        const dto = toFirestoreDto(asset, deviceId, timestamp);
        const domain = fromFirestoreDto('assets', 'a1', uid, dto as Record<string, unknown>);
        expect(domain.group).toBe(group);
      }
    });

    it('allowed unit enum values', () => {
      const units = ['Adet', 'Gram', 'Pay', 'Lot', 'TL', 'USD', 'EUR', 'GBP', 'Ons', 'Diğer'];
      for (const unit of units) {
        const asset = { id: 'a1', group: 'Altın' as const, name: 'Test', valuationMode: 'quantity' as const, quantity: 1, unit: unit as any, unitPrice: 100, currentAmount: 100, targetAmount: 200, createdAt: 1, updatedAt: 1, userId: uid };
        const dto = toFirestoreDto(asset, deviceId, timestamp);
        const domain = fromFirestoreDto('assets', 'a1', uid, dto as Record<string, unknown>);
        expect(domain.unit).toBe(unit);
      }
    });
  });

  describe('AKCE-035: investment DTO round-trip and group mapping', () => {
    const uid = 'user-1';
    const deviceId = 'device-1';
    const timestamp = { server: true };

    it('investment with new group and name round-trips through DTO', () => {
      const investment = { id: 'inv-1', group: 'ABD Hisse / ETF' as const, name: 'VOO', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2026-09', createdAt: 1, updatedAt: 1, userId: uid };
      const dto = toFirestoreDto(investment, deviceId, timestamp);
      const domain = fromFirestoreDto('investments', 'inv-1', uid, dto as Record<string, unknown>);
      expect(domain.group).toBe('ABD Hisse / ETF');
      expect(domain.name).toBe('VOO');
      expect(domain.plannedAmount).toBe(7500);
      expect(domain.actualAmount).toBe(5000);
    });

    it('legacy Nasdaq group maps to ABD Hisse / ETF', () => {
      const oldDto = { group: 'Nasdaq', name: 'VOO', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2026-09', schemaVersion: 2, deviceId: 'old', createdAt: 1, updatedAt: 1, serverUpdatedAt: timestamp };
      const domain = fromFirestoreDto('investments', 'inv-1', uid, oldDto);
      expect(domain.group).toBe('ABD Hisse / ETF');
    });

    it('legacy investment without name falls back to empty string', () => {
      const oldDto = { group: 'TEFAS', plannedAmount: 9000, actualAmount: 9000, completed: true, monthKey: '2026-09', schemaVersion: 2, deviceId: 'old', createdAt: 1, updatedAt: 1, serverUpdatedAt: timestamp };
      const domain = fromFirestoreDto('investments', 'inv-1', uid, oldDto);
      expect(domain.name).toBe('');
    });

    it('all new investment group enum values are accepted', () => {
      const groups = ['TEFAS', 'BIST Hisse', 'ABD Hisse / ETF', 'Altın', 'Gümüş', 'Döviz', 'BES', 'Eurobond / Tahvil', 'Kripto', 'Mevduat', 'Diğer'] as const;
      for (const group of groups) {
        const investment = { id: 'inv-1', group, name: 'Test', plannedAmount: 1000, actualAmount: 500, completed: false, monthKey: '2026-09', createdAt: 1, updatedAt: 1, userId: uid };
        const dto = toFirestoreDto(investment, deviceId, timestamp);
        const domain = fromFirestoreDto('investments', 'inv-1', uid, dto as Record<string, unknown>);
        expect(domain.group).toBe(group);
      }
    });

    it('investment delete mutation creates correct delete path', async () => {
      const { gateway, repository } = createRepository();
      await repository.applyMutation(uid, { type: 'investment.delete', monthKey: '2026-09', id: 'inv-1' });
      expect(gateway.deletes).toEqual([monthlyDocumentPath(uid, '2026-09', 'investments', 'inv-1')]);
    });
  });
});
