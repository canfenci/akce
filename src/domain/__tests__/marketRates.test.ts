import { describe, it, expect } from 'vitest';
import { revalueAsset, getAssetProgress } from '../financeEngine';
import type { Asset } from '../types';

const common = { createdAt: 1, updatedAt: 1, userId: 'u' };

describe('AKÇE-038: market rates & asset revaluation', () => {
  describe('empty marketRates', () => {
    it('seed data has empty marketRates', async () => {
      const { seedData } = await import('../../store/seed');
      expect(seedData.marketRates).toEqual({});
    });

    it('emptyFinanceState has empty marketRates', async () => {
      const { emptyFinanceState } = await import('../../store/localStorageFinanceRepository');
      expect(emptyFinanceState.marketRates).toEqual({});
    });
  });

  describe('month change does not reset rates', () => {
    it('initializeMonth does not touch marketRates', async () => {
      const { initializeMonth } = await import('../../store/AkceStore');
      const state = {
        schemaVersion: 2 as const,
        selectedMonthKey: '2026-08',
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        assets: [],
        goals: [],
        assetSnapshots: [],
        marketRates: { USD_TRY: 38.5, GOLD_GRAM_TRY: 3200 },
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, createdAt: 1, updatedAt: 1, userId: 'u' },
      };
      const next = initializeMonth(state, '2026-08', '2026-09');
      expect(next.marketRates).toEqual({ USD_TRY: 38.5, GOLD_GRAM_TRY: 3200 });
    });
  });

  describe('legacy asset => manual', () => {
    it('migrateState adds priceSource manual to legacy assets', async () => {
      const { migrateState } = await import('../../store/localStorageFinanceRepository');
      const legacy = {
        schemaVersion: 2,
        selectedMonthKey: '2026-09',
        assets: [
          { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'u' },
        ],
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        goals: [],
        assetSnapshots: [],
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, createdAt: 1, updatedAt: 1, userId: 'u' },
      };
      const migrated = migrateState(legacy, '2026-09');
      expect(migrated.assets[0].priceSource).toBe('manual');
    });

    it('migrateState preserves existing priceSource', async () => {
      const { migrateState } = await import('../../store/localStorageFinanceRepository');
      const legacy = {
        schemaVersion: 2,
        selectedMonthKey: '2026-09',
        assets: [
          { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY', quantity: 24, unit: 'Gram', unitPrice: 3200, currentAmount: 76800, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'u' },
        ],
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        investments: [],
        categoryBudgets: [],
        goals: [],
        assetSnapshots: [],
        settings: { currency: 'TL', monthStartDay: 1, showOnboarding: false, createdAt: 1, updatedAt: 1, userId: 'u' },
      };
      const migrated = migrateState(legacy, '2026-09');
      expect(migrated.assets[0].priceSource).toBe('rate');
      expect(migrated.assets[0].rateKey).toBe('GOLD_GRAM_TRY');
    });
  });

  describe('rate-linked revaluation', () => {
    const rateAsset: Asset = {
      id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity',
      priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY',
      quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000,
      ...common,
    };

    it('revalues asset with matching rate', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: 3500 });
      expect(result.unitPrice).toBe(3500);
      expect(result.currentAmount).toBe(84000);
    });

    it('preserves asset when rate is missing', () => {
      const result = revalueAsset(rateAsset, { USD_TRY: 38.5 });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('preserves asset when rate is zero', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: 0 });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('preserves asset when rate is negative', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: -100 });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('preserves asset when rate is NaN', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: NaN });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });
  });

  describe('manual asset unchanged', () => {
    const manualAsset: Asset = {
      id: 'a2', group: 'BES', name: 'Allianz BES', valuationMode: 'quantity',
      priceSource: 'manual',
      quantity: 1, unit: 'Adet', unitPrice: 56000, currentAmount: 56000, targetAmount: 300000,
      ...common,
    };

    it('revalueAsset returns manual asset unchanged', () => {
      const result = revalueAsset(manualAsset, { GOLD_GRAM_TRY: 3500 });
      expect(result.unitPrice).toBe(56000);
      expect(result.currentAmount).toBe(56000);
    });
  });

  describe('multiple assets sharing rate', () => {
    it('all assets with same rateKey get revalued', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
        { id: 'a2', group: 'Altın', name: 'Bilezik', valuationMode: 'quantity', priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY', quantity: 10, unit: 'Gram', unitPrice: 3083, currentAmount: 30830, targetAmount: 100000, ...common },
        { id: 'a3', group: 'BES', name: 'Allianz BES', valuationMode: 'quantity', priceSource: 'manual', quantity: 1, unit: 'Adet', unitPrice: 56000, currentAmount: 56000, targetAmount: 300000, ...common },
      ];
      const rates = { GOLD_GRAM_TRY: 3500 };
      const revalued = assets.map(a => revalueAsset(a, rates));
      expect(revalued[0].currentAmount).toBe(84000);
      expect(revalued[1].currentAmount).toBe(35000);
      expect(revalued[2].currentAmount).toBe(56000);
    });
  });

  describe('total assets update', () => {
    it('sum of revalued assets reflects rate changes', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
        { id: 'a2', group: 'BES', name: 'Allianz BES', valuationMode: 'quantity', priceSource: 'manual', quantity: 1, unit: 'Adet', unitPrice: 56000, currentAmount: 56000, targetAmount: 300000, ...common },
      ];
      const rates = { GOLD_GRAM_TRY: 3500 };
      const revalued = assets.map(a => revalueAsset(a, rates));
      const total = revalued.reduce((sum, a) => sum + a.currentAmount, 0);
      expect(total).toBe(84000 + 56000);
    });
  });

  describe('global goal updates automatically', () => {
    it('goal progress changes when rates change', () => {
      const asset: Asset = {
        id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity',
        priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY',
        quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000,
        ...common,
      };
      const before = getAssetProgress(asset);
      const revalued = revalueAsset(asset, { GOLD_GRAM_TRY: 6250 });
      const after = getAssetProgress(revalued);
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('zero rate rejected (strictly > 0 policy)', () => {
    const rateAsset: Asset = {
      id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity',
      priceSource: 'rate', rateKey: 'GOLD_GRAM_TRY',
      quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000,
      ...common,
    };

    it('undefined rate leaves asset unchanged', () => {
      const result = revalueAsset(rateAsset, {});
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
      expect(result.updatedAt).toBe(rateAsset.updatedAt);
    });

    it('zero rate leaves asset unchanged', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: 0 });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('negative rate leaves asset unchanged', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: -100 });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('NaN rate leaves asset unchanged', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: NaN });
      expect(result.unitPrice).toBe(3083);
      expect(result.currentAmount).toBe(73992);
    });

    it('positive decimal rate revalues correctly', () => {
      const result = revalueAsset(rateAsset, { GOLD_GRAM_TRY: 3456.78 });
      expect(result.unitPrice).toBe(3456.78);
      expect(result.currentAmount).toBeCloseTo(24 * 3456.78);
    });
  });
});
