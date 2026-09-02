import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Expense, Income, FixedExpense, CategoryBudget } from '../domain/types';
import { seedData, type AkceData } from './seed';

type Action =
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
  | { type: 'SET_ONBOARDING'; value: boolean }
  | { type: 'RESET' };

const storageKey = 'akce-v1-state';

function reducer(state: AkceData, action: Action): AkceData {
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
    case 'TOGGLE_INVESTMENT': return { ...state, investments: state.investments.map(item => item.id === action.id ? { ...item, completed: !item.completed, actualAmount: item.completed ? 0 : item.plannedAmount, completedDate: item.completed ? undefined : new Date().toISOString().slice(0, 10), updatedAt: Date.now() } : item) };
    case 'UPDATE_ASSET': return { ...state, assets: state.assets.map(item => item.id === action.id ? { ...item, currentAmount: Math.max(0, action.amount), updatedAt: Date.now() } : item) };
    case 'SET_ONBOARDING': return { ...state, settings: { ...state.settings, showOnboarding: action.value, updatedAt: Date.now() } };
    case 'RESET': return { ...seedData, settings: { ...seedData.settings, showOnboarding: false } };
  }
}

function init(): AkceData {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) as AkceData : seedData;
  } catch { return seedData; }
}

const StoreContext = createContext<{ state: AkceData; dispatch: Dispatch<Action> } | null>(null);

export function AkceStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(state)); }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAkceStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAkceStore must be used inside AkceStoreProvider');
  return value;
}
