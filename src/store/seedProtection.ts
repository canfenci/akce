import type { FinanceCollection, FinanceCollectionMap } from './financeRepository';
import type { AkceData } from './seed';

const SEED_TEMPLATES: {
  [K in FinanceCollection]?: Record<string, Record<string, unknown>>;
} = {
  incomes: {
    'income-1': { name: 'Maaş', amount: 82000, recurring: true },
    'income-2': { name: 'Ek ders', amount: 18000, recurring: true },
    'income-3': { name: 'Özel ders', amount: 10000, recurring: false },
  },
  fixedExpenses: {
    'fixed-1': { name: 'Kira', amount: 20500, dueDay: 3, category: 'Konut' },
    'fixed-2': { name: 'Faturalar', amount: 4728, dueDay: 12, category: 'Faturalar' },
    'fixed-3': { name: 'Abonelikler', amount: 5000, dueDay: 18, category: 'Abonelik' },
  },
  investments: {
    'inv-1': { group: 'TEFAS', plannedAmount: 9000 },
    'inv-2': { group: 'Nasdaq', plannedAmount: 5500 },
    'inv-3': { group: 'Altın', plannedAmount: 3500 },
    'inv-4': { group: 'Gümüş', plannedAmount: 1500 },
    'inv-5': { group: 'BES', plannedAmount: 3000 },
  },
  expenses: {
    'expense-1': { amount: 2650, category: 'Market' },
    'expense-2': { amount: 1450, category: 'Ulaşım' },
    'expense-3': { amount: 1200, category: 'Sosyal' },
    'expense-4': { amount: 900, category: 'Diğer' },
  },
  assets: {
    'asset-1': { group: 'TEFAS', targetAmount: 200000 },
    'asset-2': { group: 'Nasdaq', targetAmount: 250000 },
    'asset-3': { group: 'Altın', targetAmount: 150000 },
    'asset-4': { group: 'Gümüş', targetAmount: 100000 },
    'asset-5': { group: 'BES', targetAmount: 300000 },
  },
  goals: {
    'goal-1': { assetGroupId: 'freedom', targetAmount: 1000000 },
  },
  categoryBudgets: {
    'cat-1': { name: 'Market', limit: 12000 },
    'cat-2': { name: 'Ulaşım', limit: 6500 },
    'cat-3': { name: 'Sosyal', limit: 5000 },
    'cat-4': { name: 'Diğer', limit: 3500 },
  },
};

export function isSeedRecord<K extends FinanceCollection>(
  collection: K,
  item: FinanceCollectionMap[K] | { id: string },
): boolean {
  const templates = SEED_TEMPLATES[collection];
  if (!templates) return false;
  const template = templates[item.id];
  if (!template) return false;

  const candidate = item as Record<string, unknown>;
  for (const [key, value] of Object.entries(template)) {
    if (candidate[key] !== value) {
      return false; // Modified by user, treat as real user data
    }
  }
  return true;
}

export function filterUserRecords<K extends FinanceCollection>(
  collection: K,
  items: FinanceCollectionMap[K][],
): FinanceCollectionMap[K][] {
  return items.filter(item => !isSeedRecord(collection, item));
}

export function isSeedOnlyState(state: AkceData): boolean {
  const collections: FinanceCollection[] = [
    'expenses',
    'incomes',
    'fixedExpenses',
    'investments',
    'categoryBudgets',
    'assets',
    'goals',
    'assetSnapshots',
  ];

  for (const col of collections) {
    const items = (state[col] ?? []) as FinanceCollectionMap[typeof col][];
    for (const item of items) {
      if (!isSeedRecord(col, item)) {
        return false; // Found a user record
      }
    }
  }
  return true;
}

export function hasUserFinanceData(state: AkceData): boolean {
  return !isSeedOnlyState(state);
}
