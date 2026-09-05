import { getMonthKey } from '../domain/financeEngine';
import { isMonthKey } from '../domain/month';
import type { AssetList, CategoryBudget } from '../domain/types';
import { seedData, type AkceData } from './seed';
import type { LocalFinanceRepository } from './financeRepository';

export const storageKey = 'akce-v1-state';
const emptyStateKey = 'akce-v1-empty-state';

export function isEmptyStateMarkerSet(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(emptyStateKey) === '1';
}

export function setEmptyStateMarker(storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(emptyStateKey, '1');
}

export function clearEmptyStateMarker(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(emptyStateKey);
}

type LegacyCategoryBudget = Omit<CategoryBudget, 'monthKey'> & { monthKey?: string };
type LegacyData = Partial<Omit<AkceData, 'schemaVersion' | 'selectedMonthKey' | 'categoryBudgets'>> & {
  schemaVersion?: number;
  selectedMonthKey?: string;
  categoryBudgets?: LegacyCategoryBudget[];
};

const cloneSeed = (): AkceData => JSON.parse(JSON.stringify(seedData)) as AkceData;

export const emptyFinanceState: AkceData = {
  schemaVersion: 2,
  selectedMonthKey: getMonthKey(),
  expenses: [],
  incomes: [],
  fixedExpenses: [],
  investments: [],
  categoryBudgets: [],
  assets: [],
  goals: [],
  assetSnapshots: [],
  marketRates: {},
  assetLists: [],
  settings: { ...seedData.settings, showOnboarding: false },
};

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
    assets: Array.isArray(legacy.assets)
      ? legacy.assets.map(a => ({
          ...a,
          priceSource: a.priceSource ?? 'manual',
          rateKey: a.rateKey,
          assetListId: a.assetListId,
        }))
      : [],
    goals: Array.isArray(legacy.goals) ? legacy.goals : [],
    assetSnapshots: Array.isArray(legacy.assetSnapshots) ? legacy.assetSnapshots : [],
    marketRates: (legacy.marketRates && typeof legacy.marketRates === 'object') ? legacy.marketRates as Record<string, number> : {},
    assetLists: Array.isArray((legacy as Record<string, unknown>).assetLists) ? (legacy as Record<string, unknown>).assetLists as AssetList[] : [],
    settings: legacy.settings ?? cloneSeed().settings,
  };
}

export const localStorageFinanceRepository: LocalFinanceRepository = {
  kind: 'local',
  loadState(storage: Pick<Storage, 'getItem'> = localStorage): AkceData {
    if (isEmptyStateMarkerSet(storage)) {
      return { ...emptyFinanceState, selectedMonthKey: getMonthKey() };
    }
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
