import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Expense, Income, FixedExpense, CategoryBudget } from '../domain/types';
import { seedData, type AkceData } from './seed';
import { localStorageFinanceRepository } from './localStorageFinanceRepository';

export type Action =
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'REMOVE_EXPENSE'; id: string }
  | { type: 'ADD_INCOME'; payload: Income }
  | { type: 'UPDATE_INCOME'; payload: Income }
  | { type: 'DELETE_INCOME'; id: string }
  | { type: 'TOGGLE_FIXED'; id: string }
  | { type: 'TOGGLE_INVESTMENT'; id: string }
  | { type: 'UPDATE_ASSET'; id: string; amount: number }
  | { type: 'ADD_FIXED_EXPENSE'; payload: FixedExpense }
  | { type: 'UPDATE_FIXED_EXPENSE'; payload: FixedExpense }
  | { type: 'DELETE_FIXED_EXPENSE'; id: string }
  | { type: 'ADD_CATEGORY_BUDGET'; payload: CategoryBudget }
  | { type: 'UPDATE_CATEGORY_BUDGET'; payload: CategoryBudget }
  | { type: 'DELETE_CATEGORY_BUDGET'; id: string }
  | { type: 'UPDATE_INVESTMENT_AMOUNT'; payload: { id: string; plannedAmount: number } }
  | { type: 'SET_SELECTED_MONTH'; monthKey: string }
  | { type: 'INITIALIZE_MONTH'; sourceMonthKey: string; targetMonthKey: string }
  | { type: 'SET_ONBOARDING'; value: boolean }
  | { type: 'RESET' };

const copyId = (id: string, monthKey: string) => `${id.split('@')[0]}@${monthKey}`;

export function initializeMonth(state: AkceData, sourceMonthKey: string, targetMonthKey: string, timestamp: number = Date.now()): AkceData {
  if (sourceMonthKey === targetMonthKey) return state;
  const existingIds = {
    incomes: new Set(state.incomes.map(item => item.id)),
    fixedExpenses: new Set(state.fixedExpenses.map(item => item.id)),
    investments: new Set(state.investments.map(item => item.id)),
    categoryBudgets: new Set(state.categoryBudgets.map(item => item.id)),
  };
  const incomes = state.incomes
    .filter(item => item.monthKey === sourceMonthKey && item.recurring && item.active)
    .map(item => ({ ...item, id: copyId(item.id, targetMonthKey), date: `${targetMonthKey}-01`, monthKey: targetMonthKey, createdAt: timestamp, updatedAt: timestamp }))
    .filter(item => !existingIds.incomes.has(item.id));
  const fixedExpenses = state.fixedExpenses
    .filter(item => item.monthKey === sourceMonthKey && item.active)
    .map(item => ({ ...item, id: copyId(item.id, targetMonthKey), monthKey: targetMonthKey, createdAt: timestamp, updatedAt: timestamp }))
    .filter(item => !existingIds.fixedExpenses.has(item.id));
  const investments = state.investments
    .filter(item => item.monthKey === sourceMonthKey)
    .map(item => ({ ...item, id: copyId(item.id, targetMonthKey), monthKey: targetMonthKey, actualAmount: 0, completed: false, completedDate: undefined, createdAt: timestamp, updatedAt: timestamp }))
    .filter(item => !existingIds.investments.has(item.id));
  const categoryBudgets = state.categoryBudgets
    .filter(item => item.monthKey === sourceMonthKey)
    .map(item => ({ ...item, id: copyId(item.id, targetMonthKey), monthKey: targetMonthKey }))
    .filter(item => !existingIds.categoryBudgets.has(item.id));

  return {
    ...state,
    selectedMonthKey: targetMonthKey,
    incomes: [...state.incomes, ...incomes],
    fixedExpenses: [...state.fixedExpenses, ...fixedExpenses],
    investments: [...state.investments, ...investments],
    categoryBudgets: [...state.categoryBudgets, ...categoryBudgets],
  };
}

export function reducer(state: AkceData, action: Action): AkceData {
  switch (action.type) {
    case 'ADD_EXPENSE': return { ...state, expenses: [action.payload, ...state.expenses] };
    case 'REMOVE_EXPENSE': return { ...state, expenses: state.expenses.filter(item => item.id !== action.id) };
    case 'TOGGLE_FIXED': return { ...state, fixedExpenses: state.fixedExpenses.map(item => item.id === action.id ? { ...item, active: !item.active, updatedAt: Date.now() } : item) };
    case 'ADD_INCOME': return { ...state, incomes: [action.payload, ...state.incomes] };
    case 'UPDATE_INCOME': return { ...state, incomes: state.incomes.map(item => item.id === action.payload.id ? action.payload : item) };
    case 'DELETE_INCOME': return { ...state, incomes: state.incomes.filter(item => item.id !== action.id) };
    case 'ADD_FIXED_EXPENSE': return { ...state, fixedExpenses: [action.payload, ...state.fixedExpenses] };
    case 'UPDATE_FIXED_EXPENSE': return { ...state, fixedExpenses: state.fixedExpenses.map(item => item.id === action.payload.id ? action.payload : item) };
    case 'DELETE_FIXED_EXPENSE': return { ...state, fixedExpenses: state.fixedExpenses.filter(item => item.id !== action.id) };
    case 'ADD_CATEGORY_BUDGET': return { ...state, categoryBudgets: [action.payload, ...state.categoryBudgets] };
    case 'UPDATE_CATEGORY_BUDGET': return { ...state, categoryBudgets: state.categoryBudgets.map(item => item.id === action.payload.id ? action.payload : item) };
    case 'DELETE_CATEGORY_BUDGET': return { ...state, categoryBudgets: state.categoryBudgets.filter(item => item.id !== action.id) };
    case 'UPDATE_INVESTMENT_AMOUNT': return { ...state, investments: state.investments.map(item => item.id === action.payload.id ? { ...item, plannedAmount: action.payload.plannedAmount, updatedAt: Date.now() } : item) };
    case 'SET_SELECTED_MONTH': return { ...state, selectedMonthKey: action.monthKey };
    case 'INITIALIZE_MONTH': return initializeMonth(state, action.sourceMonthKey, action.targetMonthKey);
    case 'TOGGLE_INVESTMENT': return { ...state, investments: state.investments.map(item => item.id === action.id ? { ...item, completed: !item.completed, actualAmount: item.completed ? 0 : item.plannedAmount, completedDate: item.completed ? undefined : new Date().toISOString().slice(0, 10), updatedAt: Date.now() } : item) };
    case 'UPDATE_ASSET': return { ...state, assets: state.assets.map(item => item.id === action.id ? { ...item, currentAmount: Math.max(0, action.amount), updatedAt: Date.now() } : item) };
    case 'SET_ONBOARDING': return { ...state, settings: { ...state.settings, showOnboarding: action.value, updatedAt: Date.now() } };
    case 'RESET': return { ...seedData, settings: { ...seedData.settings, showOnboarding: false } };
  }
}

const StoreContext = createContext<{ state: AkceData; dispatch: Dispatch<Action> } | null>(null);

export function AkceStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, localStorageFinanceRepository.loadState);
  useEffect(() => { localStorageFinanceRepository.saveState(state); }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAkceStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAkceStore must be used inside AkceStoreProvider');
  return value;
}
