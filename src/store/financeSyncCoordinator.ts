import type {
  Asset,
  AssetList,
  AssetSnapshot,
  CategoryBudget,
  Expense,
  FixedExpense,
  Goal,
  Income,
  Investment,
} from '../domain/types';
import type {
  FinanceCollection,
  FinanceCollectionMap,
  FinanceMutation,
  FinanceRepository,
  FinanceSubscriptionUpdate,
  LocalFinanceRepository,
  MarketRatesData,
  RealtimeFinanceRepository,
} from './financeRepository';
import type { AkceData } from './seed';
import { migrateState } from './localStorageFinanceRepository';
import { fromFirestoreDto, toFirestoreDto } from './firestoreFinanceMappers';
import {
  globalCollectionPath,
  globalDocumentPath,
  marketRatesPath,
  monthPath,
  monthlyCollectionPath,
  monthlyDocumentPath,
} from './firestorePaths';
import type { FirestoreGateway, GatewayBatchOperation } from './firestoreGateway';
import { getOrCreateDeviceId } from './firebaseFinanceRepository';
import { isSeedOnlyState, filterUserRecords } from './seedProtection';
import { setEmptyStateMarker } from './localStorageFinanceRepository';
import {
  readMigrationMarker,
  writeMigrationMarker,
  type MigrationMarker,
  type MigrationMarkerRecordCounts,
} from './migrationMarker';

export type SyncStatus = 'idle' | 'migrating' | 'syncing' | 'synced' | 'offline' | 'error';

export interface FinanceSyncCoordinatorOptions {
  localRepository: LocalFinanceRepository;
  firebaseRepository: RealtimeFinanceRepository;
  gateway: FirestoreGateway;
  deviceId?: string;
  storage?: Storage;
  isOnline?: () => boolean;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onHydrateState?: (state: AkceData) => void;
  onSubscriptionUpdate?: (update: FinanceSubscriptionUpdate) => void;
  onMarketRatesUpdate?: (rates: MarketRatesData) => void;
  onAssetListsUpdate?: (lists: AssetList[]) => void;
  onError?: (error: Error) => void;
}

export function getEntityTimestamp(entity: Record<string, unknown>): number {
  const s = entity.serverUpdatedAt;
  if (s && typeof s === 'object' && 'toMillis' in s && typeof (s as { toMillis: () => number }).toMillis === 'function') {
    return (s as { toMillis: () => number }).toMillis();
  }
  if (typeof s === 'number' && Number.isFinite(s)) {
    return s;
  }
  const u = entity.updatedAt;
  if (typeof u === 'number' && Number.isFinite(u)) {
    return u;
  }
  const c = entity.createdAt;
  if (typeof c === 'number' && Number.isFinite(c)) {
    return c;
  }
  return 0;
}

export function mergeRecords<T extends { id: string }>(
  localRecords: T[],
  cloudRecords: T[],
  cloudRawMap?: Map<string, Record<string, unknown>>,
): { merged: T[]; localWins: T[] } {
  const mergedMap = new Map<string, T>();
  const localWins: T[] = [];
  const cloudMap = new Map<string, T>();

  for (const item of cloudRecords) {
    cloudMap.set(item.id, item);
  }

  // 1. Process local records
  for (const localItem of localRecords) {
    const cloudItem = cloudMap.get(localItem.id);
    if (!cloudItem) {
      // Different ID: union (local only)
      mergedMap.set(localItem.id, localItem);
      localWins.push(localItem);
    } else {
      // Same ID: conflict resolution
      const rawCloudData = cloudRawMap?.get(localItem.id);
      const cloudTs = rawCloudData ? getEntityTimestamp(rawCloudData) : getEntityTimestamp(cloudItem as Record<string, unknown>);
      const localTs = getEntityTimestamp(localItem as Record<string, unknown>);

      if (localTs > cloudTs) {
        // Local is newer
        mergedMap.set(localItem.id, localItem);
        localWins.push(localItem);
      } else {
        // Cloud is newer or equal (equal -> cloud wins)
        mergedMap.set(cloudItem.id, cloudItem);
      }
    }
  }

  // 2. Add cloud-only records
  for (const cloudItem of cloudRecords) {
    if (!mergedMap.has(cloudItem.id)) {
      mergedMap.set(cloudItem.id, cloudItem);
    }
  }

  return {
    merged: Array.from(mergedMap.values()),
    localWins,
  };
}

export class FinanceSyncCoordinator {
  private status: SyncStatus = 'idle';
  private currentUid: string | null = null;
  private currentMonthKey: string | null = null;
  private unsubscribeMonth: (() => void) | null = null;
  private unsubscribeGlobals: (() => void) | null = null;
  private unsubscribeMarketRates: (() => void) | null = null;
  private unsubscribeAssetLists: (() => void) | null = null;
  private activeRepository: FinanceRepository;
  private migrationInProgress = false;
  private aborted = false;

  private readonly localRepo: LocalFinanceRepository;
  private readonly firebaseRepo: RealtimeFinanceRepository;
  private readonly gateway: FirestoreGateway;
  private readonly deviceId: string;
  private readonly storage: Storage;
  private readonly isOnlineCheck: () => boolean;

  private readonly onSyncStatusChange?: (status: SyncStatus) => void;
  private readonly onHydrateState?: (state: AkceData) => void;
  private readonly onSubscriptionUpdate?: (update: FinanceSubscriptionUpdate) => void;
  private readonly onMarketRatesUpdate?: (rates: MarketRatesData) => void;
  private readonly onAssetListsUpdate?: (lists: AssetList[]) => void;
  private readonly onErrorCallback?: (error: Error) => void;

  constructor(options: FinanceSyncCoordinatorOptions) {
    this.localRepo = options.localRepository;
    this.firebaseRepo = options.firebaseRepository;
    this.gateway = options.gateway;
    this.deviceId = options.deviceId ?? getOrCreateDeviceId(options.storage);
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : ({} as Storage));
    this.isOnlineCheck = options.isOnline ?? (() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onHydrateState = options.onHydrateState;
    this.onSubscriptionUpdate = options.onSubscriptionUpdate;
    this.onMarketRatesUpdate = options.onMarketRatesUpdate;
    this.onAssetListsUpdate = options.onAssetListsUpdate;
    this.onErrorCallback = options.onError;

    this.activeRepository = this.localRepo;
  }

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  getActiveRepository(): FinanceRepository {
    return this.activeRepository;
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return;
    this.status = status;
    this.onSyncStatusChange?.(status);
  }

  private saveBackup(uid: string, state: AkceData) {
    try {
      this.storage.setItem?.(`akce-v1-backup-${uid}`, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors on backup
    }
  }

  getCurrentMonthKey(): string | null {
    return this.currentMonthKey;
  }

  getBackup(uid: string): AkceData | null {
    try {
      const val = this.storage.getItem?.(`akce-v1-backup-${uid}`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  async handleAuthChange(user: { uid: string } | null, selectedMonthKey: string, localStateInput?: AkceData): Promise<void> {
    this.currentMonthKey = selectedMonthKey;

    // SIGN OUT / LOCAL MODE
    if (!user) {
      this.aborted = true;
      this.currentUid = null;
      this.cleanupListeners();
      this.activeRepository = this.localRepo;
      this.setStatus('idle');
      return;
    }

    const uid = user.uid;
    this.currentUid = uid;
    this.aborted = false;

    // OFFLINE CHECK
    if (!this.isOnlineCheck()) {
      this.setStatus('offline');
      return;
    }

    // Check if migration marker already exists
    let existingMarker: MigrationMarker | null = null;
    try {
      existingMarker = await readMigrationMarker(this.gateway, uid);
    } catch (error) {
      // Preserve the real Firebase failure. Treat it as offline only when the
      // browser also reports that connectivity is unavailable.
      if (!this.isOnlineCheck()) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('error');
      this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    if (this.aborted || this.currentUid !== uid) return;

    if (existingMarker) {
      // Cloud is already migrated & canonical
      this.activeRepository = this.firebaseRepo;
      this.setStatus('syncing');
      await this.setupSubscriptions(uid, selectedMonthKey);
      this.setStatus('synced');
      return;
    }

    // Migration needed: determine Scenario A, B, or C
    await this.runMigration(uid, selectedMonthKey, localStateInput);
  }

  private async runMigration(uid: string, selectedMonthKey: string, localStateInput?: AkceData): Promise<void> {
    if (this.migrationInProgress) return;
    this.migrationInProgress = true;
    this.setStatus('migrating');

    try {
      if (!this.isOnlineCheck()) {
        this.setStatus('offline');
        return;
      }

      // 1. Prepare local state
      const rawLocalState = localStateInput ?? this.localRepo.loadState(this.storage);
      const localState = migrateState(rawLocalState, selectedMonthKey);

      // 2. Take local backup
      this.saveBackup(uid, localState);

      const localHasUserData = !isSeedOnlyState(localState);

      // 3. Inspect cloud state
      const cloudData = await this.fetchCloudData(uid);
      if (this.aborted || this.currentUid !== uid) return;

      const cloudHasData = this.hasAnyCloudData(cloudData);

      if (localHasUserData && !cloudHasData) {
        // SCENARIO A: Local full + Cloud empty
        await this.executeScenarioA(uid, localState, selectedMonthKey);
      } else if (!localHasUserData && cloudHasData) {
        // SCENARIO B: Local empty + Cloud full
        await this.executeScenarioB(uid, cloudData, localState, selectedMonthKey);
      } else if (localHasUserData && cloudHasData) {
        // SCENARIO C: Local full + Cloud full (Deterministic merge)
        await this.executeScenarioC(uid, localState, cloudData, selectedMonthKey);
      } else {
        // BOTH EMPTY: initialize cloud with marker, preserve selectedMonthKey
        await this.executeBothEmpty(uid, localState, selectedMonthKey);
      }

      if (this.aborted || this.currentUid !== uid) return;

      // Make Firebase canonical
      this.activeRepository = this.firebaseRepo;
      await this.setupSubscriptions(uid, selectedMonthKey);
      this.setStatus('synced');
    } catch (err) {
      if (!this.aborted) {
        this.setStatus('error');
        this.onErrorCallback?.(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.migrationInProgress = false;
    }
  }

  private hasAnyCloudData(cloudData: FetchedCloudData): boolean {
    if (cloudData.assets.length > 0 || cloudData.goals.length > 0 || cloudData.assetSnapshots.length > 0) return true;
    for (const month of Object.values(cloudData.months)) {
      if (
        month.expenses.length > 0 ||
        month.incomes.length > 0 ||
        month.fixedExpenses.length > 0 ||
        month.investments.length > 0 ||
        month.categoryBudgets.length > 0
      ) {
        return true;
      }
    }
    return false;
  }

  private async executeScenarioA(uid: string, localState: AkceData, selectedMonthKey: string): Promise<void> {
    // Filter out untouched seed data so dummy data doesn't upload
    const userExpenses = filterUserRecords('expenses', localState.expenses);
    const userIncomes = filterUserRecords('incomes', localState.incomes);
    const userFixed = filterUserRecords('fixedExpenses', localState.fixedExpenses);
    const userInvestments = filterUserRecords('investments', localState.investments);
    const userCategories = filterUserRecords('categoryBudgets', localState.categoryBudgets);
    const userAssets = filterUserRecords('assets', localState.assets);
    const userGoals = filterUserRecords('goals', localState.goals);
    const userSnapshots = filterUserRecords('assetSnapshots', localState.assetSnapshots);

    const operations: GatewayBatchOperation[] = [];

    // Global items
    for (const a of userAssets) operations.push({ type: 'set', path: globalDocumentPath(uid, 'assets', a.id), data: this.toDto(a) });
    for (const g of userGoals) operations.push({ type: 'set', path: globalDocumentPath(uid, 'goals', g.id), data: this.toDto(g) });
    for (const s of userSnapshots) operations.push({ type: 'set', path: globalDocumentPath(uid, 'assetSnapshots', s.id), data: this.toDto(s) });

    // Find all distinct months in local user items
    const monthKeys = new Set<string>([selectedMonthKey]);
    for (const item of [...userExpenses, ...userIncomes, ...userFixed, ...userInvestments, ...userCategories]) {
      if ('monthKey' in item && item.monthKey) monthKeys.add(item.monthKey);
    }

    const now = Date.now();
    for (const mKey of monthKeys) {
      operations.push({
        type: 'set',
        path: monthPath(uid, mKey),
        data: { monthKey: mKey, schemaVersion: 2, deviceId: this.deviceId, createdAt: now, updatedAt: now, serverUpdatedAt: this.gateway.serverTimestamp() },
        merge: true,
      });
    }

    // Monthly items
    for (const item of userExpenses) operations.push({ type: 'set', path: monthlyDocumentPath(uid, item.monthKey, 'expenses', item.id), data: this.toDto(item) });
    for (const item of userIncomes) operations.push({ type: 'set', path: monthlyDocumentPath(uid, item.monthKey, 'incomes', item.id), data: this.toDto(item) });
    for (const item of userFixed) operations.push({ type: 'set', path: monthlyDocumentPath(uid, item.monthKey, 'fixedExpenses', item.id), data: this.toDto(item) });
    for (const item of userInvestments) operations.push({ type: 'set', path: monthlyDocumentPath(uid, item.monthKey, 'investments', item.id), data: this.toDto(item) });
    for (const item of userCategories) operations.push({ type: 'set', path: monthlyDocumentPath(uid, item.monthKey, 'categoryBudgets', item.id), data: this.toDto(item) });

    // Commit batches
    await this.commitBatchesInChunks(operations);

    if (this.aborted || this.currentUid !== uid) return;

    // Write marker ONLY after successful upload
    const counts: MigrationMarkerRecordCounts = {
      expenses: userExpenses.length,
      incomes: userIncomes.length,
      fixedExpenses: userFixed.length,
      investments: userInvestments.length,
      categoryBudgets: userCategories.length,
      assets: userAssets.length,
      goals: userGoals.length,
      assetSnapshots: userSnapshots.length,
    };
    await writeMigrationMarker(this.gateway, {
      uid,
      schemaVersion: 2,
      completedAt: Date.now(),
      source: 'local',
      recordCounts: counts,
    });
  }

  private async executeScenarioB(
    uid: string,
    cloudData: FetchedCloudData,
    localState: AkceData,
    selectedMonthKey: string,
  ): Promise<void> {
    // Cloud is canonical. Reconstruct cloud state and hydrate store.
    const hydratedState = this.buildStateFromCloud(cloudData, localState.selectedMonthKey || selectedMonthKey, localState.settings);
    this.onHydrateState?.(hydratedState);

    // Write marker if absent
    const counts = this.countRecords(hydratedState);
    await writeMigrationMarker(this.gateway, {
      uid,
      schemaVersion: 2,
      completedAt: Date.now(),
      source: 'cloud',
      recordCounts: counts,
    });
  }

  private async executeScenarioC(
    uid: string,
    localState: AkceData,
    cloudData: FetchedCloudData,
    selectedMonthKey: string,
  ): Promise<void> {
    const operations: GatewayBatchOperation[] = [];

    // Merge Globals
    const mergedAssets = mergeRecords(localState.assets, cloudData.assets, cloudData.rawGlobalMap.get('assets'));
    const mergedGoals = mergeRecords(localState.goals, cloudData.goals, cloudData.rawGlobalMap.get('goals'));
    const mergedSnapshots = mergeRecords(localState.assetSnapshots, cloudData.assetSnapshots, cloudData.rawGlobalMap.get('assetSnapshots'));

    for (const item of mergedAssets.localWins) operations.push({ type: 'set', path: globalDocumentPath(uid, 'assets', item.id), data: this.toDto(item) });
    for (const item of mergedGoals.localWins) operations.push({ type: 'set', path: globalDocumentPath(uid, 'goals', item.id), data: this.toDto(item) });
    for (const item of mergedSnapshots.localWins) operations.push({ type: 'set', path: globalDocumentPath(uid, 'assetSnapshots', item.id), data: this.toDto(item) });

    // Collect all month keys
    const allMonthKeys = new Set<string>([...Object.keys(cloudData.months), selectedMonthKey]);
    for (const item of [...localState.expenses, ...localState.incomes, ...localState.fixedExpenses, ...localState.investments, ...localState.categoryBudgets]) {
      if ('monthKey' in item && item.monthKey) allMonthKeys.add(item.monthKey);
    }

    const mergedExpensesList: Expense[] = [];
    const mergedIncomesList: Income[] = [];
    const mergedFixedList: FixedExpense[] = [];
    const mergedInvestmentsList: Investment[] = [];
    const mergedCategoriesList: CategoryBudget[] = [];

    const now = Date.now();
    for (const mKey of allMonthKeys) {
      const cMonth = cloudData.months[mKey] ?? { expenses: [], incomes: [], fixedExpenses: [], investments: [], categoryBudgets: [] };
      const rawMonthMap = cloudData.rawMonthMaps.get(mKey);

      const lExpenses = localState.expenses.filter(i => i.monthKey === mKey);
      const mExpenses = mergeRecords(lExpenses, cMonth.expenses, rawMonthMap?.get('expenses'));
      mergedExpensesList.push(...mExpenses.merged);
      for (const item of mExpenses.localWins) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mKey, 'expenses', item.id), data: this.toDto(item) });

      const lIncomes = localState.incomes.filter(i => i.monthKey === mKey);
      const mIncomes = mergeRecords(lIncomes, cMonth.incomes, rawMonthMap?.get('incomes'));
      mergedIncomesList.push(...mIncomes.merged);
      for (const item of mIncomes.localWins) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mKey, 'incomes', item.id), data: this.toDto(item) });

      const lFixed = localState.fixedExpenses.filter(i => i.monthKey === mKey);
      const mFixed = mergeRecords(lFixed, cMonth.fixedExpenses, rawMonthMap?.get('fixedExpenses'));
      mergedFixedList.push(...mFixed.merged);
      for (const item of mFixed.localWins) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mKey, 'fixedExpenses', item.id), data: this.toDto(item) });

      const lInvestments = localState.investments.filter(i => i.monthKey === mKey);
      const mInvestments = mergeRecords(lInvestments, cMonth.investments, rawMonthMap?.get('investments'));
      mergedInvestmentsList.push(...mInvestments.merged);
      for (const item of mInvestments.localWins) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mKey, 'investments', item.id), data: this.toDto(item) });

      const lCategories = localState.categoryBudgets.filter(i => i.monthKey === mKey);
      const mCategories = mergeRecords(lCategories, cMonth.categoryBudgets, rawMonthMap?.get('categoryBudgets'));
      mergedCategoriesList.push(...mCategories.merged);
      for (const item of mCategories.localWins) operations.push({ type: 'set', path: monthlyDocumentPath(uid, mKey, 'categoryBudgets', item.id), data: this.toDto(item) });

      operations.push({
        type: 'set',
        path: monthPath(uid, mKey),
        data: { monthKey: mKey, schemaVersion: 2, deviceId: this.deviceId, createdAt: now, updatedAt: now, serverUpdatedAt: this.gateway.serverTimestamp() },
        merge: true,
      });
    }

    // Commit any local-won or local-only records to cloud
    if (operations.length > 0) {
      await this.commitBatchesInChunks(operations);
    }

    if (this.aborted || this.currentUid !== uid) return;

    const mergedState: AkceData = {
      schemaVersion: 2,
      selectedMonthKey: localState.selectedMonthKey || selectedMonthKey,
      expenses: mergedExpensesList,
      incomes: mergedIncomesList,
      fixedExpenses: mergedFixedList,
      investments: mergedInvestmentsList,
      categoryBudgets: mergedCategoriesList,
      assets: mergedAssets.merged,
      goals: mergedGoals.merged,
      assetSnapshots: mergedSnapshots.merged,
      marketRates: localState.marketRates ?? {},
      assetLists: localState.assetLists ?? [],
      settings: localState.settings,
    };

    // Hydrate store with merged state
    this.onHydrateState?.(mergedState);

    // Write marker
    const counts = this.countRecords(mergedState);
    await writeMigrationMarker(this.gateway, {
      uid,
      schemaVersion: 2,
      completedAt: Date.now(),
      source: 'merge',
      recordCounts: counts,
    });
  }

  private async executeBothEmpty(uid: string, _localState: AkceData, _selectedMonthKey: string): Promise<void> {
    await writeMigrationMarker(this.gateway, {
      uid,
      schemaVersion: 2,
      completedAt: Date.now(),
      source: 'local',
      recordCounts: {
        expenses: 0,
        incomes: 0,
        fixedExpenses: 0,
        investments: 0,
        categoryBudgets: 0,
        assets: 0,
        goals: 0,
        assetSnapshots: 0,
      },
    });
  }

  private countRecords(state: AkceData): MigrationMarkerRecordCounts {
    return {
      expenses: state.expenses.length,
      incomes: state.incomes.length,
      fixedExpenses: state.fixedExpenses.length,
      investments: state.investments.length,
      categoryBudgets: state.categoryBudgets.length,
      assets: state.assets.length,
      goals: state.goals.length,
      assetSnapshots: state.assetSnapshots.length,
    };
  }

  private buildStateFromCloud(cloud: FetchedCloudData, selectedMonthKey: string, settings: AkceData['settings']): AkceData {
    const allExpenses: Expense[] = [];
    const allIncomes: Income[] = [];
    const allFixed: FixedExpense[] = [];
    const allInvestments: Investment[] = [];
    const allCategories: CategoryBudget[] = [];

    for (const m of Object.values(cloud.months)) {
      allExpenses.push(...m.expenses);
      allIncomes.push(...m.incomes);
      allFixed.push(...m.fixedExpenses);
      allInvestments.push(...m.investments);
      allCategories.push(...m.categoryBudgets);
    }

    return {
      schemaVersion: 2,
      selectedMonthKey,
      expenses: allExpenses,
      incomes: allIncomes,
      fixedExpenses: allFixed,
      investments: allInvestments,
      categoryBudgets: allCategories,
      assets: cloud.assets,
      goals: cloud.goals,
      assetSnapshots: cloud.assetSnapshots,
      marketRates: {},
      assetLists: [],
      settings,
    };
  }

  private toDto(item: FinanceCollectionMap[FinanceCollection]) {
    return toFirestoreDto(item, this.deviceId, this.gateway.serverTimestamp());
  }

  private async commitBatchesInChunks(operations: GatewayBatchOperation[], chunkSize = 400): Promise<void> {
    for (let i = 0; i < operations.length; i += chunkSize) {
      if (this.aborted) return;
      const chunk = operations.slice(i, i + chunkSize);
      await this.gateway.commitBatch(chunk);
    }
  }

  private async fetchCloudData(uid: string): Promise<FetchedCloudData> {
    const rawGlobalMap = new Map<FinanceCollection, Map<string, Record<string, unknown>>>();
    const rawMonthMaps = new Map<string, Map<FinanceCollection, Map<string, Record<string, unknown>>>>();

    const assetsDocs = (await this.gateway.getDocuments?.(globalCollectionPath(uid, 'assets'))) ?? [];
    const goalsDocs = (await this.gateway.getDocuments?.(globalCollectionPath(uid, 'goals'))) ?? [];
    const snapshotDocs = (await this.gateway.getDocuments?.(globalCollectionPath(uid, 'assetSnapshots'))) ?? [];

    const assetsMap = new Map<string, Record<string, unknown>>();
    const goalsMap = new Map<string, Record<string, unknown>>();
    const snapshotsMap = new Map<string, Record<string, unknown>>();

    const assets = assetsDocs.map(d => { assetsMap.set(d.id, d.data); return fromFirestoreDto('assets', d.id, uid, d.data); });
    const goals = goalsDocs.map(d => { goalsMap.set(d.id, d.data); return fromFirestoreDto('goals', d.id, uid, d.data); });
    const assetSnapshots = snapshotDocs.map(d => { snapshotsMap.set(d.id, d.data); return fromFirestoreDto('assetSnapshots', d.id, uid, d.data); });

    rawGlobalMap.set('assets', assetsMap);
    rawGlobalMap.set('goals', goalsMap);
    rawGlobalMap.set('assetSnapshots', snapshotsMap);

    const monthDocs = (await this.gateway.getDocuments?.(`users/${uid}/months`)) ?? [];
    const months: Record<string, FetchedMonthData> = {};

    for (const mDoc of monthDocs) {
      const mKey = mDoc.id;
      const mCollectionsMap = new Map<FinanceCollection, Map<string, Record<string, unknown>>>();

      const expDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, 'expenses'))) ?? [];
      const incDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, 'incomes'))) ?? [];
      const fixDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, 'fixedExpenses'))) ?? [];
      const invDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, 'investments'))) ?? [];
      const catDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, 'categoryBudgets'))) ?? [];

      const expMap = new Map<string, Record<string, unknown>>();
      const incMap = new Map<string, Record<string, unknown>>();
      const fixMap = new Map<string, Record<string, unknown>>();
      const invMap = new Map<string, Record<string, unknown>>();
      const catMap = new Map<string, Record<string, unknown>>();

      const expenses = expDocs.map(d => { expMap.set(d.id, d.data); return fromFirestoreDto('expenses', d.id, uid, d.data); });
      const incomes = incDocs.map(d => { incMap.set(d.id, d.data); return fromFirestoreDto('incomes', d.id, uid, d.data); });
      const fixedExpenses = fixDocs.map(d => { fixMap.set(d.id, d.data); return fromFirestoreDto('fixedExpenses', d.id, uid, d.data); });
      const investments = invDocs.map(d => { invMap.set(d.id, d.data); return fromFirestoreDto('investments', d.id, uid, d.data); });
      const categoryBudgets = catDocs.map(d => { catMap.set(d.id, d.data); return fromFirestoreDto('categoryBudgets', d.id, uid, d.data); });

      mCollectionsMap.set('expenses', expMap);
      mCollectionsMap.set('incomes', incMap);
      mCollectionsMap.set('fixedExpenses', fixMap);
      mCollectionsMap.set('investments', invMap);
      mCollectionsMap.set('categoryBudgets', catMap);
      rawMonthMaps.set(mKey, mCollectionsMap);

      months[mKey] = { expenses, incomes, fixedExpenses, investments, categoryBudgets };
    }

    return { assets, goals, assetSnapshots, months, rawGlobalMap, rawMonthMaps };
  }

  private async setupSubscriptions(uid: string, monthKey: string): Promise<void> {
    this.cleanupListeners();
    if (this.aborted || this.currentUid !== uid) return;

    this.unsubscribeGlobals = this.firebaseRepo.subscribeGlobals(
      uid,
      update => this.onSubscriptionUpdate?.(update),
      error => this.handleRepositoryError(error),
    );

    this.unsubscribeMonth = this.firebaseRepo.subscribeSelectedMonth(
      uid,
      monthKey,
      update => this.onSubscriptionUpdate?.(update),
      error => this.handleRepositoryError(error),
    );

    this.unsubscribeMarketRates = this.firebaseRepo.subscribeMarketRates(
      uid,
      rates => this.onMarketRatesUpdate?.(rates),
      error => this.handleRepositoryError(error),
    );

    this.unsubscribeAssetLists = this.firebaseRepo.subscribeAssetLists(
      uid,
      lists => this.onAssetListsUpdate?.(lists),
      error => this.handleRepositoryError(error),
    );
  }

  switchSelectedMonth(monthKey: string): void {
    this.currentMonthKey = monthKey;
    if (!this.currentUid || this.activeRepository.kind !== 'firestore') return;

    // Resubscribe to the new selected month
    this.unsubscribeMonth?.();
    this.unsubscribeMonth = this.firebaseRepo.subscribeSelectedMonth(
      this.currentUid,
      monthKey,
      update => this.onSubscriptionUpdate?.(update),
      error => this.handleRepositoryError(error),
    );
  }

  async applyMutation(mutation: FinanceMutation): Promise<void> {
    if (this.activeRepository.kind === 'firestore' && this.currentUid) {
      await this.firebaseRepo.applyMutation(this.currentUid, mutation);
    }
  }

  private handleRepositoryError(error: Error): void {
    if (this.aborted) return;
    if (!this.isOnlineCheck()) {
      this.setStatus('offline');
    } else {
      this.setStatus('error');
    }
    this.onErrorCallback?.(error);
  }

  async resetUserFinanceData(uid: string): Promise<void> {
    const monthlyCollections = ['expenses', 'incomes', 'fixedExpenses', 'investments', 'categoryBudgets'] as const;
    const globalCollections = ['assets', 'goals', 'assetSnapshots'] as const;

    // 1. Enumerate monthly documents
    const monthDocs = (await this.gateway.getDocuments?.(`users/${uid}/months`)) ?? [];

    // 2. Delete all subcollection documents in each month
    for (const mDoc of monthDocs) {
      const mKey = mDoc.id;
      for (const col of monthlyCollections) {
        const colDocs = (await this.gateway.getDocuments?.(monthlyCollectionPath(uid, mKey, col))) ?? [];
        if (colDocs.length === 0) continue;
        const ops: GatewayBatchOperation[] = colDocs.map(d => ({ type: 'delete', path: monthlyDocumentPath(uid, mKey, col, d.id) }));
        await this.commitBatchesInChunks(ops);
      }
    }

    // 3. Delete month parent documents
    if (monthDocs.length > 0) {
      const monthOps: GatewayBatchOperation[] = monthDocs.map(d => ({ type: 'delete', path: monthPath(uid, d.id) }));
      await this.commitBatchesInChunks(monthOps);
    }

    // 4. Delete global collections
    for (const col of globalCollections) {
      const colDocs = (await this.gateway.getDocuments?.(globalCollectionPath(uid, col))) ?? [];
      if (colDocs.length === 0) continue;
      const ops: GatewayBatchOperation[] = colDocs.map(d => ({ type: 'delete', path: globalDocumentPath(uid, col, d.id) }));
      await this.commitBatchesInChunks(ops);
    }

    // 5. Delete market rates
    try {
      await this.gateway.deleteDocument(marketRatesPath(uid));
    } catch {
      // Market rates may not exist; ignore
    }

    // 5b. Delete asset lists
    try {
      const listDocs = (await this.gateway.getDocuments?.(`users/${uid}/assetLists`)) ?? [];
      if (listDocs.length > 0) {
        const listOps: GatewayBatchOperation[] = listDocs.map(d => ({ type: 'delete', path: `users/${uid}/assetLists/${d.id}` }));
        await this.commitBatchesInChunks(listOps);
      }
    } catch {
      // Asset lists may not exist; ignore
    }

    // 6. Delete migration marker
    try {
      await this.gateway.deleteDocument(`users/${uid}/meta/migration`);
    } catch {
      // Migration marker may not exist; ignore
    }

    // 7. Clear local storage finance data
    this.storage.removeItem?.('akce-v1-state');
    this.storage.removeItem?.(`akce-v1-backup-${uid}`);
    setEmptyStateMarker(this.storage);

    // 7. Reset coordinator state
    this.cleanupListeners();
    this.activeRepository = this.firebaseRepo;
    this.setStatus('synced');
  }

  cleanupListeners(): void {
    this.unsubscribeMonth?.();
    this.unsubscribeMonth = null;
    this.unsubscribeGlobals?.();
    this.unsubscribeGlobals = null;
    this.unsubscribeMarketRates?.();
    this.unsubscribeMarketRates = null;
    this.unsubscribeAssetLists?.();
    this.unsubscribeAssetLists = null;
    this.firebaseRepo.dispose();
  }

  dispose(): void {
    this.aborted = true;
    this.cleanupListeners();
  }
}

interface FetchedMonthData {
  expenses: Expense[];
  incomes: Income[];
  fixedExpenses: FixedExpense[];
  investments: Investment[];
  categoryBudgets: CategoryBudget[];
}

interface FetchedCloudData {
  assets: Asset[];
  goals: Goal[];
  assetSnapshots: AssetSnapshot[];
  months: Record<string, FetchedMonthData>;
  rawGlobalMap: Map<FinanceCollection, Map<string, Record<string, unknown>>>;
  rawMonthMaps: Map<string, Map<FinanceCollection, Map<string, Record<string, unknown>>>>;
}
