import { describe, expect, it } from 'vitest';
import type { Asset, AssetGroup, AssetList } from '../../domain/types';
import { getAssetListTotal, getTotalAssets, getFilteredAssets, getListlessAssets, type AssetFilter } from '../../domain/financeEngine';

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

  describe('AKÇE-041: Portfolio filtering', () => {
    const assets: Asset[] = [
      { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', assetListId: 'l1', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
      { id: 'a2', group: 'TEFAS', name: 'Fon', valuationMode: 'quantity', assetListId: 'l1', quantity: 1, unit: 'Adet', unitPrice: 132000, currentAmount: 132000, targetAmount: 200000, ...common },
      { id: 'a3', group: 'BES', name: 'BES', valuationMode: 'quantity', assetListId: 'l2', quantity: 1, unit: 'Adet', unitPrice: 56000, currentAmount: 56000, targetAmount: 300000, ...common },
      { id: 'a4', group: 'Nakit', name: 'Mevduat', valuationMode: 'quantity', quantity: 1, unit: 'TL', unitPrice: 18000, currentAmount: 18000, targetAmount: 0, ...common },
    ];

    describe('getFilteredAssets', () => {
      it('default = Tümü shows all assets', () => {
        const filter: AssetFilter = { type: 'all' };
        expect(getFilteredAssets(assets, filter)).toHaveLength(4);
      });

      it('Listesiz shows only listless assets', () => {
        const filter: AssetFilter = { type: 'listless' };
        const result = getFilteredAssets(assets, filter);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a4');
      });

      it('custom list shows only matching assetListId', () => {
        const filter: AssetFilter = { type: 'list', listId: 'l1' };
        const result = getFilteredAssets(assets, filter);
        expect(result).toHaveLength(2);
        expect(result.map(a => a.id)).toEqual(['a1', 'a2']);
      });

      it('returns empty for non-existent list', () => {
        const filter: AssetFilter = { type: 'list', listId: 'nonexistent' };
        expect(getFilteredAssets(assets, filter)).toHaveLength(0);
      });
    });

    describe('getListlessAssets', () => {
      it('returns assets without assetListId', () => {
        expect(getListlessAssets(assets)).toHaveLength(1);
        expect(getListlessAssets(assets)[0].id).toBe('a4');
      });

      it('returns empty if all assets have list', () => {
        const allListed = assets.map(a => ({ ...a, assetListId: 'l1' }));
        expect(getListlessAssets(allListed)).toHaveLength(0);
      });
    });

    describe('selected list total', () => {
      it('custom list total correct', () => {
        expect(getAssetListTotal(assets, 'l1')).toBe(205992);
        expect(getAssetListTotal(assets, 'l2')).toBe(56000);
      });

      it('Listesiz total correct', () => {
        const listlessTotal = assets.filter(a => !a.assetListId).reduce((s, a) => s + a.currentAmount, 0);
        expect(listlessTotal).toBe(18000);
      });

      it('global Total Assets unchanged by filter', () => {
        const globalTotal = getTotalAssets(assets);
        expect(globalTotal).toBe(279992);
        expect(getAssetListTotal(assets, 'l1') + getAssetListTotal(assets, 'l2') + 18000).toBe(globalTotal);
      });
    });

    describe('create context preselection', () => {
      function getListIdFromFilter(filter: AssetFilter): string | undefined {
        return filter.type === 'list' ? filter.listId : undefined;
      }

      it('custom list filter provides listId for create', () => {
        const filter: AssetFilter = { type: 'list', listId: 'l1' };
        expect(getListIdFromFilter(filter)).toBe('l1');
      });

      it('Tümü filter defaults to no list', () => {
        const filter: AssetFilter = { type: 'all' };
        expect(getListIdFromFilter(filter)).toBeUndefined();
      });

      it('Listesiz filter defaults to no list', () => {
        const filter: AssetFilter = { type: 'listless' };
        expect(getListIdFromFilter(filter)).toBeUndefined();
      });
    });

    describe('list lifecycle', () => {
      it('rename preserves filter by ID', () => {
        const filter: AssetFilter = { type: 'list', listId: 'l1' };
        const renamedList = { id: 'l1', name: 'Acil Durum Fonu', ...common };
        const result = getFilteredAssets(assets, filter);
        expect(result).toHaveLength(2);
        expect(renamedList.name).toBe('Acil Durum Fonu');
      });

      it('delete selected list falls back to Tümü', () => {
        const filter: AssetFilter = { type: 'list', listId: 'l1' };
        const exists = assets.some(a => a.assetListId === filter.listId);
        expect(exists).toBe(true);
        const remaining = assets.filter(a => a.assetListId !== filter.listId);
        expect(remaining).toHaveLength(2);
      });
    });

    describe('market rate revaluation updates filtered list total', () => {
      it('rate-linked asset in list revalues correctly', async () => {
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
        const filter: AssetFilter = { type: 'list', listId: 'l1' };
        const filtered = getFilteredAssets([revalued], filter);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].currentAmount).toBe(84000);
      });
    });
  });
});
