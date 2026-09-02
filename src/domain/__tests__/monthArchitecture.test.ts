import { describe, expect, it } from 'vitest';
import { calculateMonthSummary, getMonthKey } from '../financeEngine';
import { getMonthCalculationDate, isMonthKey, shiftMonthKey } from '../month';
import { initializeMonth } from '../../store/AkceStore';
import { localStorageFinanceRepository, migrateState, storageKey } from '../../store/localStorageFinanceRepository';
import { seedData, type AkceData } from '../../store/seed';

const clone = (): AkceData => JSON.parse(JSON.stringify(seedData)) as AkceData;

function septemberState(): AkceData {
  const state = clone();
  return {
    ...state,
    selectedMonthKey: '2026-09',
    incomes: state.incomes.map(item => ({ ...item, monthKey: '2026-09', date: '2026-09-01' })),
    fixedExpenses: state.fixedExpenses.map(item => ({ ...item, monthKey: '2026-09' })),
    investments: state.investments.map(item => ({ ...item, monthKey: '2026-09' })),
    expenses: state.expenses.map(item => ({ ...item, monthKey: '2026-09', date: '2026-09-02' })),
    categoryBudgets: state.categoryBudgets.map(item => ({ ...item, monthKey: '2026-09' })),
  };
}

describe('Month architecture', () => {
  it('keeps month keys in YYYY-MM format across month boundaries', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
  });

  it('does not include a September expense in the October summary', () => {
    const state = septemberState();
    const summary = calculateMonthSummary([], [], [], state.expenses, [], new Date('2026-10-15T12:00:00'));
    expect(summary.monthKey).toBe('2026-10');
    expect(summary.totalVariableExpenses).toBe(0);
  });

  it('copies only active recurring income into a new month', () => {
    const state = septemberState();
    state.incomes[0].recurring = true;
    state.incomes[1].recurring = false;
    const october = initializeMonth(state, '2026-09', '2026-10', 1);
    const copied = october.incomes.filter(item => item.monthKey === '2026-10');
    expect(copied.every(item => item.recurring && item.active)).toBe(true);
    expect(copied.some(item => item.name === state.incomes[0].name)).toBe(true);
    expect(copied.some(item => item.name === state.incomes[1].name)).toBe(false);
  });

  it('copies active fixed expenses into a new month', () => {
    const state = septemberState();
    state.fixedExpenses[0].active = true;
    state.fixedExpenses[1].active = false;
    const october = initializeMonth(state, '2026-09', '2026-10', 1);
    const copied = october.fixedExpenses.filter(item => item.monthKey === '2026-10');
    expect(copied.every(item => item.active)).toBe(true);
    expect(copied.some(item => item.name === state.fixedExpenses[0].name)).toBe(true);
    expect(copied.some(item => item.name === state.fixedExpenses[1].name)).toBe(false);
  });

  it('treats a historical month as complete with zero days left', () => {
    const date = getMonthCalculationDate('2026-08', new Date('2026-09-15T12:00:00'));
    const summary = calculateMonthSummary([], [], [], [], [], date);
    expect(getMonthKey(date)).toBe('2026-08');
    expect(summary.daysLeft).toBe(0);
    expect(summary.monthProgress).toBe(100);
    expect(summary.dailySafeLimit).toBe(0);
  });

  it('migrates legacy local state without losing records', () => {
    const state = septemberState();
    const legacy = { ...state, schemaVersion: undefined, selectedMonthKey: undefined, categoryBudgets: state.categoryBudgets.map(({ monthKey: _monthKey, ...item }) => item) };
    const migrated = localStorageFinanceRepository.loadState({ getItem: key => key === storageKey ? JSON.stringify(legacy) : null });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.selectedMonthKey).toBe('2026-09');
    expect(migrated.expenses).toHaveLength(state.expenses.length);
    expect(migrated.categoryBudgets.every(item => item.monthKey === '2026-09')).toBe(true);
  });

  it('keeps migration idempotent', () => {
    const migrated = migrateState(septemberState(), '2026-09');
    expect(migrateState(migrated, '2026-09')).toEqual(migrated);
  });

  it('never copies expenses or completed investment state into a new month', () => {
    const state = septemberState();
    state.investments[0] = { ...state.investments[0], completed: true, actualAmount: 9000, completedDate: '2026-09-02' };
    const once = initializeMonth(state, '2026-09', '2026-10', 1);
    const twice = initializeMonth(once, '2026-09', '2026-10', 1);
    const copiedInvestment = once.investments.find(item => item.monthKey === '2026-10' && item.group === state.investments[0].group);
    expect(once.expenses.some(item => item.monthKey === '2026-10')).toBe(false);
    expect(copiedInvestment).toMatchObject({ completed: false, actualAmount: 0, completedDate: undefined });
    expect(twice).toEqual(once);
  });
});
