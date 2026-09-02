import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Expense, Income, FixedExpense, CategoryBudget } from '../domain/types';
import { seedData, type AkceData } from './seed';
import { localStorageFinanceRepository, storageKey } from './localStorageFinanceRepository';
import { createFirebaseFinanceRepository } from './firebaseFinanceRepository';
import { createFirestoreGateway } from './firestoreGateway';
import { FinanceSyncCoordinator, type SyncStatus } from './financeSyncCoordinator';
import type { FinanceMutation, FinanceSubscriptionUpdate } from './financeRepository';
import { useAuth } from '../auth/AuthProvider';

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
  | { type: 'RESET' }
  | { type: 'SYNC_HYDRATE_STATE'; state: AkceData }
  | { type: 'SYNC_SUBSCRIPTION_UPDATE'; update: FinanceSubscriptionUpdate };

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
    case 'SYNC_HYDRATE_STATE': return action.state;
    case 'SYNC_SUBSCRIPTION_UPDATE': {
      const { collection, items } = action.update;
      if (collection === 'assets' || collection === 'goals' || collection === 'assetSnapshots') {
        return { ...state, [collection]: items };
      }
      const otherMonthItems = (state[collection] as Array<{ monthKey: string }>).filter(
        item => item.monthKey !== state.selectedMonthKey,
      );
      return {
        ...state,
        [collection]: [...otherMonthItems, ...(items as typeof state[typeof collection])],
      };
    }
  }
}

interface StoreContextValue {
  state: AkceData;
  dispatch: Dispatch<Action>;
  syncStatus: SyncStatus;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function mapActionToMutation(action: Action, currentState: AkceData): FinanceMutation | null {
  switch (action.type) {
    case 'ADD_EXPENSE': return { type: 'expense.create', value: action.payload };
    case 'REMOVE_EXPENSE': {
      const item = currentState.expenses.find(e => e.id === action.id);
      return item ? { type: 'expense.delete', monthKey: item.monthKey, id: item.id } : null;
    }
    case 'ADD_INCOME': return { type: 'income.create', value: action.payload };
    case 'UPDATE_INCOME': return { type: 'income.update', value: action.payload };
    case 'DELETE_INCOME': {
      const item = currentState.incomes.find(i => i.id === action.id);
      return item ? { type: 'income.delete', monthKey: item.monthKey, id: item.id } : null;
    }
    case 'ADD_FIXED_EXPENSE': return { type: 'fixedExpense.create', value: action.payload };
    case 'UPDATE_FIXED_EXPENSE': return { type: 'fixedExpense.update', value: action.payload };
    case 'DELETE_FIXED_EXPENSE': {
      const item = currentState.fixedExpenses.find(f => f.id === action.id);
      return item ? { type: 'fixedExpense.delete', monthKey: item.monthKey, id: item.id } : null;
    }
    case 'TOGGLE_FIXED': {
      const item = currentState.fixedExpenses.find(f => f.id === action.id);
      return item ? { type: 'fixedExpense.toggle', monthKey: item.monthKey, id: item.id, active: !item.active, updatedAt: Date.now() } : null;
    }
    case 'UPDATE_INVESTMENT_AMOUNT': {
      const item = currentState.investments.find(i => i.id === action.payload.id);
      return item ? { type: 'investment.update', value: { ...item, plannedAmount: action.payload.plannedAmount, updatedAt: Date.now() } } : null;
    }
    case 'TOGGLE_INVESTMENT': {
      const item = currentState.investments.find(i => i.id === action.id);
      if (!item) return null;
      const completed = !item.completed;
      return {
        type: 'investment.toggle',
        monthKey: item.monthKey,
        id: item.id,
        completed,
        actualAmount: completed ? item.plannedAmount : 0,
        completedDate: completed ? new Date().toISOString().slice(0, 10) : undefined,
        updatedAt: Date.now(),
      };
    }
    case 'ADD_CATEGORY_BUDGET': return { type: 'categoryBudget.create', value: action.payload };
    case 'UPDATE_CATEGORY_BUDGET': return { type: 'categoryBudget.update', value: action.payload };
    case 'DELETE_CATEGORY_BUDGET': {
      const item = currentState.categoryBudgets.find(c => c.id === action.id);
      return item ? { type: 'categoryBudget.delete', monthKey: item.monthKey, id: item.id } : null;
    }
    case 'UPDATE_ASSET': {
      const item = currentState.assets.find(a => a.id === action.id);
      return item ? { type: 'asset.update', value: { ...item, currentAmount: Math.max(0, action.amount), updatedAt: Date.now() } } : null;
    }
    case 'INITIALIZE_MONTH': {
      const nextState = initializeMonth(currentState, action.sourceMonthKey, action.targetMonthKey);
      return {
        type: 'month.initialize',
        value: {
          monthKey: action.targetMonthKey,
          incomes: nextState.incomes.filter(i => i.monthKey === action.targetMonthKey),
          fixedExpenses: nextState.fixedExpenses.filter(f => f.monthKey === action.targetMonthKey),
          investments: nextState.investments.filter(i => i.monthKey === action.targetMonthKey),
          categoryBudgets: nextState.categoryBudgets.filter(c => c.monthKey === action.targetMonthKey),
        },
      };
    }
    default: return null;
  }
}

export function AkceStoreProvider({
  children,
  coordinator: injectedCoordinator,
}: {
  children: ReactNode;
  coordinator?: FinanceSyncCoordinator;
}) {
  const [state, rawDispatch] = useReducer(reducer, undefined, localStorageFinanceRepository.loadState);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const stateRef = useRef(state);
  stateRef.current = state;

  let auth: ReturnType<typeof useAuth> | null = null;
  try {
    auth = useAuth();
  } catch {
    // Graceful fallback for environments without AuthProvider
  }

  const coordinator = useMemo(() => {
    if (injectedCoordinator) return injectedCoordinator;
    const gateway = createFirestoreGateway();
    const firebaseRepo = createFirebaseFinanceRepository({ gateway });
    return new FinanceSyncCoordinator({
      localRepository: localStorageFinanceRepository,
      firebaseRepository: firebaseRepo,
      gateway,
      onSyncStatusChange: setSyncStatus,
      onHydrateState: nextState => rawDispatch({ type: 'SYNC_HYDRATE_STATE', state: nextState }),
      onSubscriptionUpdate: update => rawDispatch({ type: 'SYNC_SUBSCRIPTION_UPDATE', update }),
    });
  }, [injectedCoordinator]);

  // Handle Auth changes & triggers
  useEffect(() => {
    if (auth?.mode === 'firebase' && auth.status === 'signedIn' && auth.user) {
      void coordinator.handleAuthChange(auth.user, stateRef.current.selectedMonthKey, stateRef.current);
    } else {
      void coordinator.handleAuthChange(null, stateRef.current.selectedMonthKey);
    }
  }, [auth?.status, auth?.mode, auth?.user?.uid, coordinator]);

  // Clean persistence: only write full state when local repository is canonical.
  // In cloud mode: do NOT double-write finance collections, only persist selectedMonthKey & local settings.
  useEffect(() => {
    if (coordinator.getActiveRepository().kind === 'local') {
      localStorageFinanceRepository.saveState(state);
    } else {
      try {
        const partialData = {
          selectedMonthKey: state.selectedMonthKey,
          settings: state.settings,
        };
        localStorage.setItem(`${storageKey}-pref`, JSON.stringify(partialData));
      } catch {
        // Ignore storage write issues for preferences
      }
    }
  }, [state, coordinator]);

  const dispatch: Dispatch<Action> = useCallback(
    (action: Action) => {
      const currentState = stateRef.current;
      rawDispatch(action);

      if (action.type === 'SET_SELECTED_MONTH') {
        coordinator.switchSelectedMonth(action.monthKey);
      } else {
        const mutation = mapActionToMutation(action, currentState);
        if (mutation) {
          void coordinator.applyMutation(mutation).catch(() => {
            // Coordinator will handle offline / error transitions
          });
        }
      }
    },
    [coordinator],
  );

  const value = useMemo(() => ({ state, dispatch, syncStatus }), [state, dispatch, syncStatus]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAkceStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAkceStore must be used inside AkceStoreProvider');
  return value;
}

export function useSyncStatus(): SyncStatus {
  const { syncStatus } = useAkceStore();
  return syncStatus;
}

