import { getMonthKey } from '../domain/financeEngine';
import { isMonthKey } from '../domain/month';
import type { CategoryBudget } from '../domain/types';
import { seedData, type AkceData } from './seed';
import type { FinanceRepository } from './financeRepository';

export const storageKey = 'akce-v1-state';

type LegacyCategoryBudget = Omit<CategoryBudget, 'monthKey'> & { monthKey?: string };
type LegacyData = Partial<Omit<AkceData, 'schemaVersion' | 'selectedMonthKey' | 'categoryBudgets'>> & {
  schemaVersion?: number;
  selectedMonthKey?: string;
  categoryBudgets?: LegacyCategoryBudget[];
};

const cloneSeed = (): AkceData => JSON.parse(JSON.stringify(seedData)) as AkceData;

export function migrateState(input: unknown, currentMonthKey: string = getMonthKey()): AkceData {
  if (!input || typeof input !== 'object') return cloneSeed();
  const legacy = input as LegacyData;
  const selectedMonthKey = isMonthKey(legacy.selectedMonthKey) ? legacy.selectedMonthKey : currentMonthKey;
  const normalizeMonth = <T extends { monthKey?: string }>(items: T[] | undefined): (T & { monthKey: string })[] =>
    (Array.isArray(items) ? items : []).map(item => ({ ...item, monthKey: isMonthKey(item.monthKey) ? item.monthKey : currentMonthKey }));

  return {
    schemaVersion: 2,
    selectedMonthKey,
    expenses: normalizeMonth(legacy.expenses),
    incomes: normalizeMonth(legacy.incomes),
    fixedExpenses: normalizeMonth(legacy.fixedExpenses),
    investments: normalizeMonth(legacy.investments),
    categoryBudgets: normalizeMonth(legacy.categoryBudgets),
    assets: Array.isArray(legacy.assets) ? legacy.assets : [],
    goals: Array.isArray(legacy.goals) ? legacy.goals : [],
    assetSnapshots: Array.isArray(legacy.assetSnapshots) ? legacy.assetSnapshots : [],
    settings: legacy.settings ?? cloneSeed().settings,
  };
}

export const localStorageFinanceRepository: FinanceRepository = {
  loadState(storage: Pick<Storage, 'getItem'> = localStorage): AkceData {
    try {
      const saved = storage.getItem(storageKey);
      return saved ? migrateState(JSON.parse(saved)) : cloneSeed();
    } catch {
      return cloneSeed();
    }
  },
  saveState(state: AkceData, storage: Pick<Storage, 'setItem'> = localStorage): void {
    storage.setItem(storageKey, JSON.stringify(state));
  },
};
