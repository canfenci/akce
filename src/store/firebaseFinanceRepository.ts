import type { FinanceCollectionMap, FinanceMutation, FinanceSubscriptionUpdate, MarketRatesData, RealtimeFinanceRepository } from './financeRepository';
import { FinanceRepositoryError } from './financeRepository';
import { fromFirestoreDto, toFirestoreDto } from './firestoreFinanceMappers';
import { createFirestoreGateway, type FirestoreGateway, type GatewayBatchOperation } from './firestoreGateway';
import { globalCollectionPath, globalDocumentPath, marketRatesPath, monthPath, monthlyCollectionPath, monthlyDocumentPath } from './firestorePaths';
import type { FirestoreCacheMode } from '../firebase/firebaseFirestore';

const deviceStorageKey = 'akce-v1-device-id';
const monthlyCollections = ['expenses', 'incomes', 'fixedExpenses', 'investments', 'categoryBudgets'] as const;
const globalCollections = ['assets', 'goals', 'assetSnapshots'] as const;

export function normalizeRepositoryError(error: unknown): FinanceRepositoryError {
  if (error instanceof FinanceRepositoryError) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return new FinanceRepositoryError('permission-denied', 'Firestore erişim izni reddedildi.', error);
  if (code === 'unavailable' || code === 'firestore/unavailable') return new FinanceRepositoryError('network-unavailable', 'Firestore ağına şu anda ulaşılamıyor.', error);
  if (code === 'invalid-argument' || code === 'data-loss') return new FinanceRepositoryError('invalid-data', 'Firestore verisi geçersiz.', error);
  if (error instanceof Error && error.message.startsWith('Geçersiz Firestore')) return new FinanceRepositoryError('invalid-data', error.message, error);
  return new FinanceRepositoryError('unknown', 'Firestore işlemi tamamlanamadı.', error);
}

export function getOrCreateDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  const existing = storage.getItem(deviceStorageKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(deviceStorageKey, id);
  return id;
}

export class FirebaseFinanceRepository implements RealtimeFinanceRepository {
  readonly kind = 'firestore' as const;
  private readonly activeListeners = new Set<() => void>();

  constructor(private readonly gateway: FirestoreGateway, private readonly deviceId: string) {}

  private subscribeCollections<C extends keyof FinanceCollectionMap>(
    uid: string,
    collections: readonly C[],
    pathFor: (collection: C) => string,
    onUpdate: (update: FinanceSubscriptionUpdate) => void,
    onError: (error: FinanceRepositoryError) => void,
  ) {
    const listeners: (() => void)[] = [];
    try {
      for (const collection of collections) {
        const unsubscribeGateway = this.gateway.subscribeCollection(pathFor(collection), documents => {
          try {
            const items = documents.map(document => fromFirestoreDto(collection, document.id, uid, document.data));
            onUpdate({ collection, items } as FinanceSubscriptionUpdate);
          } catch (error) {
            onError(normalizeRepositoryError(error));
          }
        }, error => onError(normalizeRepositoryError(error)));
        let active = true;
        const unsubscribe = () => {
          if (!active) return;
          active = false;
          unsubscribeGateway();
          this.activeListeners.delete(unsubscribe);
        };
        listeners.push(unsubscribe);
        this.activeListeners.add(unsubscribe);
      }
    } catch (error) {
      for (const unsubscribe of listeners) {
        unsubscribe();
      }
      throw normalizeRepositoryError(error);
    }

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      for (const unsubscribe of listeners) {
        unsubscribe();
      }
    };
  }

  subscribeSelectedMonth(uid: string, monthKey: string, onUpdate: (update: FinanceSubscriptionUpdate) => void, onError: (error: FinanceRepositoryError) => void) {
    return this.subscribeCollections(uid, monthlyCollections, collection => monthlyCollectionPath(uid, monthKey, collection), onUpdate, onError);
  }

  subscribeGlobals(uid: string, onUpdate: (update: FinanceSubscriptionUpdate) => void, onError: (error: FinanceRepositoryError) => void) {
    return this.subscribeCollections(uid, globalCollections, collection => globalCollectionPath(uid, collection), onUpdate, onError);
  }

  subscribeMarketRates(uid: string, onUpdate: (rates: MarketRatesData) => void, onError: (error: FinanceRepositoryError) => void) {
    const path = marketRatesPath(uid);
    const unsubscribeGateway = this.gateway.subscribeDocument(path, document => {
      try {
        const data = document?.data ?? {};
        const rates: MarketRatesData = {};
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            rates[key] = value;
          }
        }
        onUpdate(rates);
      } catch (error) {
        onError(normalizeRepositoryError(error));
      }
    }, error => onError(normalizeRepositoryError(error)));
    let active = true;
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      unsubscribeGateway();
      this.activeListeners.delete(unsubscribe);
    };
    this.activeListeners.add(unsubscribe);
    return unsubscribe;
  }

  private dto(value: FinanceCollectionMap[keyof FinanceCollectionMap]) {
    return toFirestoreDto(value, this.deviceId, this.gateway.serverTimestamp());
  }

  private updateDto(value: FinanceCollectionMap[keyof FinanceCollectionMap]) {
    const { createdAt: _createdAt, ...dto } = this.dto(value);
    return dto;
  }

  async applyMutation(uid: string, mutation: FinanceMutation): Promise<void> {
    try {
      switch (mutation.type) {
        case 'expense.create': await this.gateway.setDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'expenses', mutation.value.id), this.dto(mutation.value)); break;
        case 'expense.delete': await this.gateway.deleteDocument(monthlyDocumentPath(uid, mutation.monthKey, 'expenses', mutation.id)); break;
        case 'income.create': await this.gateway.setDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'incomes', mutation.value.id), this.dto(mutation.value)); break;
        case 'income.update': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'incomes', mutation.value.id), this.updateDto(mutation.value)); break;
        case 'income.delete': await this.gateway.deleteDocument(monthlyDocumentPath(uid, mutation.monthKey, 'incomes', mutation.id)); break;
        case 'fixedExpense.create': await this.gateway.setDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'fixedExpenses', mutation.value.id), this.dto(mutation.value)); break;
        case 'fixedExpense.update': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'fixedExpenses', mutation.value.id), this.updateDto(mutation.value)); break;
        case 'fixedExpense.delete': await this.gateway.deleteDocument(monthlyDocumentPath(uid, mutation.monthKey, 'fixedExpenses', mutation.id)); break;
        case 'fixedExpense.toggle': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.monthKey, 'fixedExpenses', mutation.id), { active: mutation.active, updatedAt: mutation.updatedAt, schemaVersion: 2, deviceId: this.deviceId, serverUpdatedAt: this.gateway.serverTimestamp() }); break;
        case 'investment.update': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'investments', mutation.value.id), this.updateDto(mutation.value)); break;
        case 'investment.create': await this.gateway.setDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'investments', mutation.value.id), this.dto(mutation.value)); break;
        case 'investment.delete': await this.gateway.deleteDocument(monthlyDocumentPath(uid, mutation.monthKey, 'investments', mutation.id)); break;
        case 'investment.toggle': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.monthKey, 'investments', mutation.id), { completed: mutation.completed, actualAmount: mutation.actualAmount, completedDate: mutation.completedDate ?? null, updatedAt: mutation.updatedAt, schemaVersion: 2, deviceId: this.deviceId, serverUpdatedAt: this.gateway.serverTimestamp() }); break;
        case 'categoryBudget.create': await this.gateway.setDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'categoryBudgets', mutation.value.id), this.dto(mutation.value)); break;
        case 'categoryBudget.update': await this.gateway.updateDocument(monthlyDocumentPath(uid, mutation.value.monthKey, 'categoryBudgets', mutation.value.id), this.updateDto(mutation.value)); break;
        case 'categoryBudget.delete': await this.gateway.deleteDocument(monthlyDocumentPath(uid, mutation.monthKey, 'categoryBudgets', mutation.id)); break;
        case 'asset.update': await this.gateway.updateDocument(globalDocumentPath(uid, 'assets', mutation.value.id), this.updateDto(mutation.value)); break;
        case 'asset.create': await this.gateway.setDocument(globalDocumentPath(uid, 'assets', mutation.value.id), this.dto(mutation.value)); break;
        case 'asset.delete': await this.gateway.deleteDocument(globalDocumentPath(uid, 'assets', mutation.id)); break;
        case 'marketRates.update': {
          const now = Date.now();
          const ratesData: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(mutation.rates)) {
            ratesData[key] = value;
          }
          const operations: GatewayBatchOperation[] = [
            { type: 'set', path: marketRatesPath(uid), data: { ...ratesData, schemaVersion: 2, deviceId: this.deviceId, updatedAt: now, createdAt: now, serverUpdatedAt: this.gateway.serverTimestamp() }, merge: true },
            ...mutation.assets.map(asset => ({ type: 'update' as const, path: globalDocumentPath(uid, 'assets', asset.id), data: this.updateDto(asset) })),
          ];
          await this.gateway.commitBatch(operations);
          break;
        }
        case 'month.initialize': {
          const now = Date.now();
          const operations: GatewayBatchOperation[] = [{ type: 'set', path: monthPath(uid, mutation.value.monthKey), data: { monthKey: mutation.value.monthKey, schemaVersion: 2, deviceId: this.deviceId, createdAt: now, updatedAt: now, serverUpdatedAt: this.gateway.serverTimestamp() }, merge: true }];
          const entries = [
            ['incomes', mutation.value.incomes],
            ['fixedExpenses', mutation.value.fixedExpenses],
            ['investments', mutation.value.investments],
            ['categoryBudgets', mutation.value.categoryBudgets],
          ] as const;
          for (const [collection, values] of entries) {
            for (const value of values) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mutation.value.monthKey, collection, value.id), data: this.dto(value) });
          }
          await this.gateway.commitBatch(operations);
          break;
        }
      }
    } catch (error) {
      throw normalizeRepositoryError(error);
    }
  }

  dispose() {
    for (const unsubscribe of [...this.activeListeners]) unsubscribe();
    this.activeListeners.clear();
  }
}

export function createFirebaseFinanceRepository({ gateway, deviceId, cacheMode = 'memory' }: { gateway?: FirestoreGateway; deviceId?: string; cacheMode?: FirestoreCacheMode } = {}) {
  return new FirebaseFinanceRepository(gateway ?? createFirestoreGateway(cacheMode), deviceId ?? getOrCreateDeviceId());
}
