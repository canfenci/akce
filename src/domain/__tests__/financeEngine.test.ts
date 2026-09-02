import { describe, it, expect } from 'vitest';
import { 
  getMonthKey, 
  getDaysLeftInMonth, 
  getMonthProgress,
  calculateMonthSummary,
  formatCurrency,
  formatPercentage,
  getAssetProgress,
  getTotalAssets
} from '../financeEngine';
import { Expense, Income, FixedExpense, Investment, Asset } from '../types';

describe('Finance Engine', () => {
  describe('getMonthKey', () => {
    it('should return correct month key for current date', () => {
      const date = new Date('2024-01-15');
      expect(getMonthKey(date)).toBe('2024-01');
    });

    it('should pad single digit months', () => {
      const date = new Date('2024-03-15');
      expect(getMonthKey(date)).toBe('2024-03');
    });
  });

  describe('getDaysLeftInMonth', () => {
    it('should calculate remaining days correctly', () => {
      const date = new Date('2024-01-15');
      expect(getDaysLeftInMonth(date)).toBe(16); // 31 - 15 = 16
    });

    it('should handle February', () => {
      const date = new Date('2024-02-15');
      expect(getDaysLeftInMonth(date)).toBe(14); // 29 - 15 = 14 (leap year)
    });
  });

  describe('getMonthProgress', () => {
    it('should calculate month progress percentage', () => {
      const date = new Date('2024-01-15');
      const progress = getMonthProgress(date);
      expect(progress).toBeCloseTo(48.39, 1); // 15/31 * 100
    });
  });

  describe('calculateMonthSummary', () => {
    it('should calculate daily safe limit correctly', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [
        { id: '1', name: 'Kira', amount: 10000, dueDay: 1, category: 'konut', frequency: 'monthly', active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', plannedAmount: 5000, actualAmount: 0, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const expenses: Expense[] = [
        { id: '1', amount: 2000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-05', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // Gelir: 50000
      // Yatırım: 5000
      // Otomatik gider: 10000
      // Değişken gider: 2000
      // Kalan: 50000 - 5000 - 10000 - 2000 = 33000
      // Kalan gün: 16
      // Günlük limit: 33000 / 16 = 2062.5
      expect(summary.remainingBudget).toBe(33000);
      expect(summary.daysLeft).toBe(16);
      expect(summary.dailySafeLimit).toBeCloseTo(2062.5, 1);
    });

    it('should exclude investment from spendable budget', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [];
      
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', plannedAmount: 10000, actualAmount: 0, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const expenses: Expense[] = [];
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // Yatırım parası bütçeden düşülmeli
      expect(summary.remainingBudget).toBe(20000); // 30000 - 10000
    });

    it('should calculate unplanned expense ratio', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [];
      const investments: Investment[] = [];
      
      const expenses: Expense[] = [
        { id: '1', amount: 1000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-05', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '2', amount: 500, category: 'eğlence', type: 'plansız', paymentMethod: 'nakit', date: '2024-01-06', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // Toplam: 1500, Plansız: 500
      // Oran: 500/1500 * 100 = 33.33%
      expect(summary.unplannedRatio).toBeCloseTo(33.33, 1);
    });

    it('should calculate 7-day average', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [];
      const investments: Investment[] = [];
      
      const expenses: Expense[] = [
        { id: '1', amount: 1000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-08', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '2', amount: 1500, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-09', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '3', amount: 2000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-10', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // 3 harcama var, toplam 4500
      // Ortalama: 4500 / 3 = 1500
expect(summary.sevenDayAverage).toBe(1500);
     });
   });

   describe('monthEndEstimate', () => {
     it('should use 7-day average when available', () => {
       const incomes: Income[] = [
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const fixedExpenses: FixedExpense[] = [];
       
       const investments: Investment[] = [];
       
       const expenses: Expense[] = [
         { id: '1', amount: 1000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-08', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
         { id: '2', amount: 1500, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-09', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
         { id: '3', amount: 2000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-10', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const assets: Asset[] = [];
       const currentDate = new Date('2024-01-15'); // daysLeft = 16
       
       const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
       
       // totalVariableExpenses = 4500
       // sevenDayAverage = (1000+1500+2000)/3 = 1500
       // daysLeft = 16
       // expected monthEndEstimate = 4500 + 1500 * 16 = 4500 + 24000 = 28500
       expect(summary.monthEndEstimate).toBeCloseTo(28500, 1);
     });
     

     
     it('should use 0 when no expense data', () => {
       const incomes: Income[] = [
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const fixedExpenses: FixedExpense[] = [];
       
       const investments: Investment[] = [];
       
       const expenses: Expense[] = [];
       
       const assets: Asset[] = [];
       const currentDate = new Date('2024-01-15');
       
       const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
       
       // No variable expenses, averages should be 0
       expect(summary.monthEndEstimate).toBe(0);
     });
     
     it('should use totalVariableExpenses when daysLeft is 0', () => {
       const incomes: Income[] = [
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-31', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const fixedExpenses: FixedExpense[] = [];
       
       const investments: Investment[] = [];
       
       const expenses: Expense[] = [
         { id: '1', amount: 500, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-31', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const assets: Asset[] = [];
       const currentDate = new Date('2024-01-31'); // daysLeft = 0
       
       const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
       
       // daysLeft = 0, so monthEndEstimate should equal totalVariableExpenses
       expect(summary.monthEndEstimate).toBe(summary.totalVariableExpenses);
     });
     
     it('should be deterministic regardless of remainingBudget sign', () => {
       // Case 1: positive remainingBudget
       const incomes1: Income[] = [
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const fixedExpenses1: FixedExpense[] = [
         { id: '1', name: 'Kira', amount: 10000, dueDay: 1, category: 'konut', frequency: 'monthly', active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const investments1: Investment[] = [];
       
       const expenses1: Expense[] = [
         { id: '1', amount: 1000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-05', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
         { id: '2', amount: 1500, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-06', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const assets1: Asset[] = [];
       const currentDate = new Date('2024-01-15');
       
       const summary1 = calculateMonthSummary(incomes1, fixedExpenses1, investments1, expenses1, assets1, currentDate);
       
       // Case 2: negative remainingBudget (higher expenses)
       const incomes2: Income[] = [
         { id: '1', name: 'Maaş', amount: 20000, date: '2024-01-01', recurring: true, active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const fixedExpenses2: FixedExpense[] = [
         { id: '1', name: 'Kira', amount: 10000, dueDay: 1, category: 'konut', frequency: 'monthly', active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const investments2: Investment[] = [];
       
       const expenses2: Expense[] = [
         { id: '1', amount: 5000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-05', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' },
         { id: '2', amount: 6000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-06', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
       ];
       
       const assets2: Asset[] = [];
       const currentDate2 = new Date('2024-01-15');
       
       const summary2 = calculateMonthSummary(incomes2, fixedExpenses2, investments2, expenses2, assets2, currentDate2);
       
       // The monthEndEstimate should be proportional to the expenses and averages, not affected by remainingBudget sign.
       // We'll just check that the values are computed (not NaN) and that they differ as expected.
       expect(!isNaN(summary1.monthEndEstimate)).toBe(true);
       expect(!isNaN(summary2.monthEndEstimate)).toBe(true);
       expect(summary2.monthEndEstimate).toBeGreaterThan(summary1.monthEndEstimate);
     });
   });

  describe('formatCurrency', () => {
    it('should format currency in Turkish locale', () => {
      expect(formatCurrency(1824)).toBe('1.824 TL');
      expect(formatCurrency(52905)).toBe('52.905 TL');
    });

    it('should handle decimals', () => {
      expect(formatCurrency(1000.50)).toBe('1.001 TL');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with one decimal', () => {
      expect(formatPercentage(66.666)).toBe('%66,7');
      expect(formatPercentage(44.7)).toBe('%44,7');
    });
  });

  describe('getAssetProgress', () => {
    it('should calculate asset progress percentage', () => {
      const asset: Asset = {
        id: '1',
        group: 'TEFAS',
        currentAmount: 132000,
        targetAmount: 200000,
        createdAt: 1,
        updatedAt: 1,
        userId: 'user1'
      };
      
      expect(getAssetProgress(asset)).toBe(66);
    });

    it('should handle zero target', () => {
      const asset: Asset = {
        id: '1',
        group: 'TEFAS',
        currentAmount: 10000,
        targetAmount: 0,
        createdAt: 1,
        updatedAt: 1,
        userId: 'user1'
      };
      
      expect(getAssetProgress(asset)).toBe(0);
    });
  });

  describe('getTotalAssets', () => {
    it('should sum all asset current amounts', () => {
      const assets: Asset[] = [
        { id: '1', group: 'TEFAS', currentAmount: 132000, targetAmount: 200000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '2', group: 'Nasdaq', currentAmount: 185000, targetAmount: 250000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '3', group: 'Altın', currentAmount: 74000, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '4', group: 'BES', currentAmount: 56000, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      expect(getTotalAssets(assets)).toBe(447000);
    });
  });
});
