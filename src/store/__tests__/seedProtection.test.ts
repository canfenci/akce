import { describe, expect, it } from 'vitest';
import { seedData, type AkceData } from '../seed';
import {
  filterUserRecords,
  hasUserFinanceData,
  isSeedOnlyState,
  isSeedRecord,
} from '../seedProtection';

describe('Seed protection and detection', () => {
  it('correctly identifies unmodified seed items', () => {
    expect(isSeedRecord('incomes', seedData.incomes[0])).toBe(true);
    expect(isSeedRecord('fixedExpenses', seedData.fixedExpenses[0])).toBe(true);
    expect(isSeedRecord('investments', seedData.investments[0])).toBe(true);
    expect(isSeedRecord('expenses', seedData.expenses[0])).toBe(true);
    expect(isSeedRecord('assets', seedData.assets[0])).toBe(true);
    expect(isSeedRecord('goals', seedData.goals[0])).toBe(true);
    expect(isSeedRecord('categoryBudgets', seedData.categoryBudgets[0])).toBe(true);
  });

  it('treats modified seed items as user data', () => {
    const modifiedIncome = { ...seedData.incomes[0], amount: 999999 };
    expect(isSeedRecord('incomes', modifiedIncome)).toBe(false);

    const modifiedExpense = { ...seedData.expenses[0], amount: 1 };
    expect(isSeedRecord('expenses', modifiedExpense)).toBe(false);
  });

  it('treats items with custom IDs as user data', () => {
    const customItem = {
      id: 'custom-uuid-123',
      amount: 250,
      category: 'Market',
    };
    expect(isSeedRecord('expenses', customItem as any)).toBe(false);
  });

  it('detects an untouched seedData state as seed-only', () => {
    expect(isSeedOnlyState(seedData)).toBe(true);
    expect(hasUserFinanceData(seedData)).toBe(false);
  });

  it('detects state with added user items as having user finance data', () => {
    const stateWithUserExpense: AkceData = {
      ...seedData,
      expenses: [
        ...seedData.expenses,
        {
          id: 'new-expense-1',
          amount: 50,
          category: 'Diğer',
          type: 'zorunlu',
          paymentMethod: 'nakit',
          date: '2026-09-02',
          monthKey: '2026-09',
          createdAt: 1000,
          updatedAt: 1000,
          userId: 'local-user',
        },
      ],
    };

    expect(isSeedOnlyState(stateWithUserExpense)).toBe(false);
    expect(hasUserFinanceData(stateWithUserExpense)).toBe(true);
  });

  it('filters out unmodified seed items from collections', () => {
    const filtered = filterUserRecords('expenses', seedData.expenses);
    expect(filtered).toHaveLength(0);

    const mixed = [
      seedData.expenses[0],
      {
        id: 'user-created-expense',
        amount: 300,
        category: 'Market',
        type: 'zorunlu' as const,
        paymentMethod: 'kart' as const,
        date: '2026-09-02',
        monthKey: '2026-09',
        createdAt: 1000,
        updatedAt: 1000,
        userId: 'local-user',
      },
    ];
    const filteredMixed = filterUserRecords('expenses', mixed);
    expect(filteredMixed).toHaveLength(1);
    expect(filteredMixed[0].id).toBe('user-created-expense');
  });
});
