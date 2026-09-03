import type { Asset, AssetSnapshot, CategoryBudget, Expense, FixedExpense, Goal, Income, Investment } from '../domain/types';
import type { AkceData } from './seed';

export interface FinanceRepository {
  readonly kind: 'local' | 'firestore';
}

export interface LocalFinanceRepository extends FinanceRepository {
  readonly kind: 'local';
  loadState(storage?: Pick<Storage, 'getItem'>): AkceData;
  saveState(state: AkceData, storage?: Pick<Storage, 'setItem'>): void;
}

export interface FinanceCollectionMap {
  expenses: Expense;
  incomes: Income;
  fixedExpenses: FixedExpense;
  investments: Investment;
  categoryBudgets: CategoryBudget;
  assets: Asset;
  goals: Goal;
  assetSnapshots: AssetSnapshot;
}

export type FinanceCollection = keyof FinanceCollectionMap;
export type FinanceSubscriptionUpdate<K extends FinanceCollection = FinanceCollection> = {
  collection: K;
  items: FinanceCollectionMap[K][];
};

export interface MonthInitializationPayload {
  monthKey: string;
  incomes: Income[];
  fixedExpenses: FixedExpense[];
  investments: Investment[];
  categoryBudgets: CategoryBudget[];
}

export type FinanceMutation =
  | { type: 'expense.create'; value: Expense }
  | { type: 'expense.delete'; monthKey: string; id: string }
  | { type: 'income.create'; value: Income }
  | { type: 'income.update'; value: Income }
  | { type: 'income.delete'; monthKey: string; id: string }
  | { type: 'fixedExpense.create'; value: FixedExpense }
  | { type: 'fixedExpense.update'; value: FixedExpense }
  | { type: 'fixedExpense.delete'; monthKey: string; id: string }
  | { type: 'fixedExpense.toggle'; monthKey: string; id: string; active: boolean; updatedAt: number }
  | { type: 'investment.update'; value: Investment }
  | { type: 'investment.toggle'; monthKey: string; id: string; completed: boolean; actualAmount: number; completedDate?: string; updatedAt: number }
  | { type: 'categoryBudget.create'; value: CategoryBudget }
  | { type: 'categoryBudget.update'; value: CategoryBudget }
  | { type: 'categoryBudget.delete'; monthKey: string; id: string }
  | { type: 'asset.update'; value: Asset }
  | { type: 'asset.create'; value: Asset }
  | { type: 'asset.delete'; id: string }
  | { type: 'month.initialize'; value: MonthInitializationPayload };

export interface RealtimeFinanceRepository extends FinanceRepository {
  readonly kind: 'firestore';
  subscribeSelectedMonth(uid: string, monthKey: string, onUpdate: (update: FinanceSubscriptionUpdate) => void, onError: (error: FinanceRepositoryError) => void): () => void;
  subscribeGlobals(uid: string, onUpdate: (update: FinanceSubscriptionUpdate) => void, onError: (error: FinanceRepositoryError) => void): () => void;
  applyMutation(uid: string, mutation: FinanceMutation): Promise<void>;
  dispose(): void;
}

export type FinanceRepositoryErrorKind = 'permission-denied' | 'network-unavailable' | 'invalid-data' | 'unknown';

export class FinanceRepositoryError extends Error {
  constructor(public readonly kind: FinanceRepositoryErrorKind, message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'FinanceRepositoryError';
  }
}

export interface FirebaseErrorDetails {
  code?: string;
  message: string;
}

export function getFirebaseErrorDetails(error: unknown): FirebaseErrorDetails {
  const original = error instanceof FinanceRepositoryError && error.originalError
    ? error.originalError
    : error;
  const code = typeof original === 'object' && original && 'code' in original
    ? String(original.code)
    : undefined;
  const message = original instanceof Error
    ? original.message
    : typeof original === 'object' && original && 'message' in original
      ? String(original.message)
      : error instanceof Error
        ? error.message
        : String(error);
  return { code, message };
}
