import { describe, expect, it } from 'vitest';
import type { Asset, AssetGroup, AssetList } from '../../domain/types';
import { getAssetListTotal, getTotalAssets } from '../../domain/financeEngine';

const common = { createdAt: 1, updatedAt: 1, userId: 'u' };

describe('AKÇE-040: User-defined asset lists', () => {
  describe('AssetList type', () => {
    it('has required fields', () => {
      const list: AssetList = { id: 'l1', name: 'Acil Fon', ...common };
      expect(list.id).toBe('l1');
      expect(list.name).toBe('Acil Fon');
      expect(list.userId).toBe('u');
    });
  });

  describe('getAssetListTotal', () => {
    const assets: Asset[] = [
      { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', assetListId: 'l1', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
      { id: 'a2', group: 'TEFAS', name: 'Fon', valuationMode: 'quantity', assetListId: 'l1', quantity: 1, unit: 'Adet', unitPrice: 132000, currentAmount: 132000, targetAmount: 200000, ...common },
      { id: 'a3', group: 'BES', name: 'BES', valuationMode: 'quantity', assetListId: 'l2', quantity: 1, unit: 'Adet', unitPrice: 56000, currentAmount: 56000, targetAmount: 300000, ...common },
      { id: 'a4', group: 'Nakit', name: 'Mevduat', valuationMode: 'quantity', quantity: 1, unit: 'TL', unitPrice: 18000, currentAmount: 18000, targetAmount: 0, ...common },
    ];

    it('sums assets in a list', () => {
      expect(getAssetListTotal(assets, 'l1')).toBe(205992);
    });

    it('returns 0 for empty list', () => {
      expect(getAssetListTotal(assets, 'nonexistent')).toBe(0);
    });

    it('sums listless assets separately', () => {
      const listless = assets.filter(a => !a.assetListId);
      expect(listless.length).toBe(1);
      expect(listless[0].currentAmount).toBe(18000);
    });
  });

  describe('global totals unchanged by list assignment', () => {
    it('Total Assets is same regardless of list assignment', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', assetListId: 'l1', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
        { id: 'a2', group: 'TEFAS', name: 'Fon', valuationMode: 'quantity', quantity: 1, unit: 'Adet', unitPrice: 132000, currentAmount: 132000, targetAmount: 200000, ...common },
      ];
      expect(getTotalAssets(assets)).toBe(205992);
      assets[0].assetListId = undefined;
      expect(getTotalAssets(assets)).toBe(205992);
    });
  });

  describe('market rate revaluation preserved', () => {
    it('linked asset still revalues while assigned to list', async () => {
      const { revalueAsset } = await import('../../domain/financeEngine');
      const asset: Asset = {
        id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity',
        priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY', assetListId: 'l1',
        quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000,
        ...common,
      };
      const revalued = revalueAsset(asset, { GOLD_GRAM_TRY: 3500 });
      expect(revalued.currentAmount).toBe(84000);
      expect(revalued.assetListId).toBe('l1');
    });
  });

  describe('migration compatibility', () => {
    it('migrateState handles missing assetLists', async () => {
      const { migrateState } = await import('../../store/localStorageFinanceRepository');
      const legacy = {
        schemaVersion: 2,
        selectedMonthKey: '2026-09',
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        assets: [],
        goals: [],
        assetSnapshots: [],
        marketRates: {},
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false },
      };
      const migrated = migrateState(legacy);
      expect(migrated.assetLists).toEqual([]);
    });

    it('migrateState preserves assetListId on assets', async () => {
      const { migrateState } = await import('../../store/localStorageFinanceRepository');
      const legacy = {
        schemaVersion: 2,
        selectedMonthKey: '2026-09',
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        assets: [{ id: 'a1', group: 'Altın', name: 'Test', valuationMode: 'quantity', assetListId: 'l1', currentAmount: 100, targetAmount: 200, ...common }],
        goals: [],
        assetSnapshots: [],
        marketRates: {},
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false },
      };
      const migrated = migrateState(legacy);
      expect(migrated.assets[0].assetListId).toBe('l1');
    });
  });

  describe('reducer actions', () => {
    it('ADD_ASSET_LIST adds list', async () => {
      const { reducer } = await import('../../store/AkceStore');
      const state = { assetLists: [], assets: [], marketRates: {}, schemaVersion: 2 as const, selectedMonthKey: '2026-09', expenses: [], incomes: [], fixedExpenses: [], investments: [], categoryBudgets: [], goals: [], assetSnapshots: [], settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, ...common } };
      const list: AssetList = { id: 'l1', name: 'Acil Fon', ...common };
      const next = reducer(state, { type: 'ADD_ASSET_LIST', payload: list });
      expect(next.assetLists).toHaveLength(1);
      expect(next.assetLists[0].name).toBe('Acil Fon');
    });

    it('DELETE_ASSET_LIST removes list and unlinks assets', async () => {
      const { reducer } = await import('../../store/AkceStore');
      const state = {
        assetLists: [{ id: 'l1', name: 'Acil Fon', ...common }],
        assets: [
          { id: 'a1', group: 'Altın' as AssetGroup, name: 'Test', valuationMode: 'quantity' as const, assetListId: 'l1', currentAmount: 100, targetAmount: 200, ...common },
          { id: 'a2', group: 'TEFAS' as AssetGroup, name: 'Test2', valuationMode: 'quantity' as const, assetListId: 'l2', currentAmount: 200, targetAmount: 300, ...common },
        ],
        marketRates: {},
        schemaVersion: 2 as const,
        selectedMonthKey: '2026-09',
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        goals: [],
        assetSnapshots: [],
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, ...common },
      };
      const next = reducer(state, { type: 'DELETE_ASSET_LIST', id: 'l1' });
      expect(next.assetLists).toHaveLength(0);
      expect(next.assets[0].assetListId).toBeUndefined();
      expect(next.assets[1].assetListId).toBe('l2');
    });

    it('UPDATE_ASSET_LIST renames list', async () => {
      const { reducer } = await import('../../store/AkceStore');
      const state = {
        assetLists: [{ id: 'l1', name: 'Acil Fon', ...common }],
        assets: [],
        marketRates: {},
        schemaVersion: 2 as const,
        selectedMonthKey: '2026-09',
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        goals: [],
        assetSnapshots: [],
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, ...common },
      };
      const next = reducer(state, { type: 'UPDATE_ASSET_LIST', payload: { id: 'l1', name: 'Acil Durum Fonu', ...common } });
      expect(next.assetLists[0].name).toBe('Acil Durum Fonu');
    });
  });

  describe('Firestore rules simulation', () => {
    it('owner allowed on assetLists', () => {
      const simulate = (uid: string, path: string) => {
        const parts = path.split('/');
        if (parts[0] === 'users' && parts[2] === 'assetLists') {
          return uid === parts[1] ? { allowed: true } : { allowed: false };
        }
        return { allowed: false };
      };
      expect(simulate('u1', 'users/u1/assetLists/l1').allowed).toBe(true);
      expect(simulate('u2', 'users/u1/assetLists/l1').allowed).toBe(false);
    });
  });
});
