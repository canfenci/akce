import { describe, it, expect } from 'vitest';
import {
  getExtraIncome,
  getFlexAmount,
  getNetInvestment,
  getEmergencyFundValue,
  getEmergencyFundAllocationTier,
  getInvestmentAllocation,
  EMERGENCY_FUND_TIERS,
} from '../financeEngine';
import type { Income, Asset, AssetList } from '../types';

describe('AKÇE-047: Income-Derived Savings & Investment Allocation', () => {
  describe('getExtraIncome', () => {
    const monthKey = '2026-09';

    it('sums Ek Ders and Özel Ders', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Ek Ders', amount: 15000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
        { id: '2', name: 'Özel Ders', amount: 20000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(35000);
    });

    it('handles Ek Ders only', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Ek Ders', amount: 15000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(15000);
    });

    it('handles Özel Ders only', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Özel Ders', amount: 20000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(20000);
    });

    it('sums multiple entries for same type', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Ek Ders', amount: 10000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
        { id: '2', name: 'Ek Ders', amount: 5000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
        { id: '3', name: 'Özel Ders', amount: 20000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(35000);
    });

    it('treats missing values as 0', () => {
      expect(getExtraIncome([], monthKey)).toBe(0);
    });

    it('ignores inactive incomes', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Ek Ders', amount: 15000, date: '2026-09-01', recurring: true, active: false, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(0);
    });

    it('ignores other income types', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 50000, date: '2026-09-01', recurring: true, active: true, monthKey, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getExtraIncome(incomes, monthKey)).toBe(0);
    });
  });

  describe('getFlexAmount', () => {
    it('caps at 10000', () => {
      expect(getFlexAmount(35000)).toBe(10000);
    });

    it('returns full amount if below 10000', () => {
      expect(getFlexAmount(7000)).toBe(7000);
    });

    it('returns exactly 10000 if exactly 10000', () => {
      expect(getFlexAmount(10000)).toBe(10000);
    });

    it('never exceeds extraIncome', () => {
      expect(getFlexAmount(5000)).toBe(5000);
    });
  });

  describe('getNetInvestment', () => {
    it('subtracts flexAmount from extraIncome', () => {
      expect(getNetInvestment(35000)).toBe(25000);
    });

    it('returns 0 when extraIncome <= 10000', () => {
      expect(getNetInvestment(7000)).toBe(0);
    });

    it('returns 0 when extraIncome is 0', () => {
      expect(getNetInvestment(0)).toBe(0);
    });

    it('never returns negative', () => {
      expect(getNetInvestment(-5000)).toBe(0);
    });

    it('handles exactly 10000', () => {
      expect(getNetInvestment(10000)).toBe(0);
    });
  });

  describe('getEmergencyFundValue', () => {
    const assetLists: AssetList[] = [
      { id: 'list-1', name: 'Acil Fon', createdAt: 0, updatedAt: 0, userId: 'u' },
      { id: 'list-2', name: 'Yatırım', createdAt: 0, updatedAt: 0, userId: 'u' },
    ];

    it('sums all assets in Acil Fon list', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Nakit', name: 'Nakit', valuationMode: 'direct', currentAmount: 30000, targetAmount: 50000, assetListId: 'list-1', createdAt: 0, updatedAt: 0, userId: 'u' },
        { id: 'a2', group: 'Mevduat', name: 'Mevduat', valuationMode: 'direct', currentAmount: 20000, targetAmount: 50000, assetListId: 'list-1', createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getEmergencyFundValue(assets, assetLists)).toBe(50000);
    });

    it('ignores assets in other lists', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Nakit', name: 'Nakit', valuationMode: 'direct', currentAmount: 30000, targetAmount: 50000, assetListId: 'list-1', createdAt: 0, updatedAt: 0, userId: 'u' },
        { id: 'a2', group: 'Altın', name: 'Altın', valuationMode: 'direct', currentAmount: 50000, targetAmount: 50000, assetListId: 'list-2', createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getEmergencyFundValue(assets, assetLists)).toBe(30000);
    });

    it('returns 0 if Acil Fon list missing', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Nakit', name: 'Nakit', valuationMode: 'direct', currentAmount: 30000, targetAmount: 50000, assetListId: 'list-1', createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getEmergencyFundValue(assets, [])).toBe(0);
    });

    it('returns 0 if no assets in list', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Nakit', name: 'Nakit', valuationMode: 'direct', currentAmount: 30000, targetAmount: 50000, createdAt: 0, updatedAt: 0, userId: 'u' },
      ];
      expect(getEmergencyFundValue(assets, assetLists)).toBe(0);
    });
  });

  describe('getEmergencyFundAllocationTier', () => {
    it('returns 30/40/20/10 for <50k', () => {
      const tier = getEmergencyFundAllocationTier(49999);
      expect(tier.tp2).toBe(30);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(20);
      expect(tier.nasdaq).toBe(10);
    });

    it('returns 25/40/22.5/12.5 for 50k', () => {
      const tier = getEmergencyFundAllocationTier(50000);
      expect(tier.tp2).toBe(25);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(22.5);
      expect(tier.nasdaq).toBe(12.5);
    });

    it('returns 25/40/22.5/12.5 for 99999', () => {
      const tier = getEmergencyFundAllocationTier(99999);
      expect(tier.tp2).toBe(25);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(22.5);
      expect(tier.nasdaq).toBe(12.5);
    });

    it('returns 20/40/25/15 for 100k', () => {
      const tier = getEmergencyFundAllocationTier(100000);
      expect(tier.tp2).toBe(20);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(25);
      expect(tier.nasdaq).toBe(15);
    });

    it('returns 20/40/25/15 for 199999', () => {
      const tier = getEmergencyFundAllocationTier(199999);
      expect(tier.tp2).toBe(20);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(25);
      expect(tier.nasdaq).toBe(15);
    });

    it('returns 10/40/30/20 for 200k', () => {
      const tier = getEmergencyFundAllocationTier(200000);
      expect(tier.tp2).toBe(10);
      expect(tier.hisse).toBe(40);
      expect(tier.altinGumus).toBe(30);
      expect(tier.nasdaq).toBe(20);
    });

    it('tiers always total 100%', () => {
      for (const tier of EMERGENCY_FUND_TIERS) {
        expect(tier.tp2 + tier.hisse + tier.altinGumus + tier.nasdaq).toBe(100);
      }
    });
  });

  describe('getInvestmentAllocation', () => {
    it('distributes 25000 with base tier', () => {
      const alloc = getInvestmentAllocation(25000, 0);
      expect(alloc.tp2).toBe(7500);
      expect(alloc.hisse).toBe(10000);
      expect(alloc.altinGumus).toBe(5000);
      expect(alloc.nasdaq).toBe(2500);
    });

    it('Hisse Senedi Fonları always 40%', () => {
      const amounts = [10000, 25000, 50000, 100000];
      for (const amount of amounts) {
        const alloc = getInvestmentAllocation(amount, 0);
        expect(alloc.hisse).toBe(Math.round(amount * 0.4));
      }
    });

    it('allocation total equals Net Yatırım', () => {
      const alloc = getInvestmentAllocation(25000, 0);
      expect(alloc.tp2 + alloc.hisse + alloc.altinGumus + alloc.nasdaq).toBe(25000);
    });

    it('returns all zeros for Net Yatırım <= 0', () => {
      const alloc = getInvestmentAllocation(0, 0);
      expect(alloc.tp2).toBe(0);
      expect(alloc.hisse).toBe(0);
      expect(alloc.altinGumus).toBe(0);
      expect(alloc.nasdaq).toBe(0);
    });

    it('distributes correctly at 50k tier', () => {
      const alloc = getInvestmentAllocation(25000, 50000);
      expect(alloc.tp2).toBe(6250);
      expect(alloc.hisse).toBe(10000);
      expect(alloc.altinGumus).toBe(5625);
      expect(alloc.nasdaq).toBe(3125);
    });

    it('distributes correctly at 100k tier', () => {
      const alloc = getInvestmentAllocation(25000, 100000);
      expect(alloc.tp2).toBe(5000);
      expect(alloc.hisse).toBe(10000);
      expect(alloc.altinGumus).toBe(6250);
      expect(alloc.nasdaq).toBe(3750);
    });

    it('distributes correctly at 200k tier', () => {
      const alloc = getInvestmentAllocation(25000, 200000);
      expect(alloc.tp2).toBe(2500);
      expect(alloc.hisse).toBe(10000);
      expect(alloc.altinGumus).toBe(7500);
      expect(alloc.nasdaq).toBe(5000);
    });
  });
});
