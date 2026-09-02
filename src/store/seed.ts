import { getMonthKey } from '../domain/financeEngine';
import type { Asset, AssetSnapshot, CategoryBudget, Expense, FixedExpense, Goal, Income, Investment, UserSettings } from '../domain/types';

const now = new Date();
const monthKey = getMonthKey(now);
const stamp = now.getTime();
const dateAgo = (days: number) => {
  const value = new Date(now);
  value.setDate(Math.max(1, value.getDate() - days));
  return value.toISOString().slice(0, 10);
};
const common = { createdAt: stamp, updatedAt: stamp, userId: 'local-user' };

export interface AkceData {
  schemaVersion: 2;
  selectedMonthKey: string;
  expenses: Expense[];
  incomes: Income[];
  fixedExpenses: FixedExpense[];
  investments: Investment[];
  assets: Asset[];
  goals: Goal[];
  categoryBudgets: CategoryBudget[];
  assetSnapshots: AssetSnapshot[];
  settings: UserSettings;
}

export const seedData: AkceData = {
  schemaVersion: 2,
  selectedMonthKey: monthKey,
  incomes: [
    { id: 'income-1', name: 'Maaş', amount: 82000, date: dateAgo(1), recurring: true, active: true, monthKey, ...common },
    { id: 'income-2', name: 'Ek ders', amount: 18000, date: dateAgo(1), recurring: true, active: true, monthKey, ...common },
    { id: 'income-3', name: 'Özel ders', amount: 10000, date: dateAgo(1), recurring: false, active: true, monthKey, ...common },
  ],
  fixedExpenses: [
    { id: 'fixed-1', name: 'Kira', amount: 20500, dueDay: 3, category: 'Konut', frequency: 'monthly', active: true, monthKey, ...common },
    { id: 'fixed-2', name: 'Faturalar', amount: 4728, dueDay: 12, category: 'Faturalar', frequency: 'monthly', active: true, monthKey, ...common },
    { id: 'fixed-3', name: 'Abonelikler', amount: 5000, dueDay: 18, category: 'Abonelik', frequency: 'monthly', active: true, monthKey, ...common },
  ],
  investments: [
    { id: 'inv-1', group: 'TEFAS', plannedAmount: 9000, actualAmount: 9000, completed: true, completedDate: dateAgo(1), monthKey, ...common },
    { id: 'inv-2', group: 'Nasdaq', plannedAmount: 5500, actualAmount: 0, completed: false, monthKey, ...common },
    { id: 'inv-3', group: 'Altın', plannedAmount: 3500, actualAmount: 3500, completed: true, completedDate: dateAgo(1), monthKey, ...common },
    { id: 'inv-4', group: 'Gümüş', plannedAmount: 1500, actualAmount: 0, completed: false, monthKey, ...common },
    { id: 'inv-5', group: 'BES', plannedAmount: 3000, actualAmount: 3000, completed: true, completedDate: dateAgo(1), monthKey, ...common },
  ],
  expenses: [
    { id: 'expense-1', amount: 2650, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', note: 'Haftalık alışveriş', date: dateAgo(0), monthKey, ...common },
    { id: 'expense-2', amount: 1450, category: 'Ulaşım', type: 'zorunlu', paymentMethod: 'kart', note: 'Yakıt', date: dateAgo(1), monthKey, ...common },
    { id: 'expense-3', amount: 1200, category: 'Sosyal', type: 'isteğe bağlı', paymentMethod: 'kart', note: 'Akşam yemeği', date: dateAgo(2), monthKey, ...common },
    { id: 'expense-4', amount: 900, category: 'Diğer', type: 'plansız', paymentMethod: 'nakit', note: 'Beklenmedik ihtiyaç', date: dateAgo(2), monthKey, ...common },
  ],
  assets: [
    { id: 'asset-1', group: 'TEFAS', currentAmount: 132000, targetAmount: 200000, ...common },
    { id: 'asset-2', group: 'Nasdaq', currentAmount: 185000, targetAmount: 250000, ...common },
    { id: 'asset-3', group: 'Altın', currentAmount: 74000, targetAmount: 150000, ...common },
    { id: 'asset-4', group: 'Gümüş', currentAmount: 24000, targetAmount: 100000, ...common },
    { id: 'asset-5', group: 'BES', currentAmount: 56000, targetAmount: 300000, ...common },
  ],
  goals: [{ id: 'goal-1', assetGroupId: 'freedom', targetAmount: 1000000, ...common }],
  categoryBudgets: [
    { id: 'cat-1', name: 'Market', limit: 12000, color: '#538b67', monthKey },
    { id: 'cat-2', name: 'Ulaşım', limit: 6500, color: '#bb8d3f', monthKey },
    { id: 'cat-3', name: 'Sosyal', limit: 5000, color: '#8b6b55', monthKey },
    { id: 'cat-4', name: 'Diğer', limit: 3500, color: '#777d76', monthKey },
  ],
  assetSnapshots: [],
  settings: { currency: 'TL', monthStartDay: 1, showOnboarding: true, ...common },
};
