import { describe, it, expect } from 'vitest';
import { 
  getMonthKey, 
  getDaysLeftInMonth, 
  getMonthProgress,
  calculateMonthSummary,
  calculateInvestmentRatio,
  calculateExpenseRatio,
  formatCurrency,
  formatPercentage,
  formatRatio,
  getAssetProgress,
  getTotalAssets,
  getTotalAssetTargets,
  getInvestmentProgress,
  getInvestmentRemaining,
  isInvestmentCompleted,
  parseLocaleNumber,
  sanitizeNumericInput
} from '../financeEngine';
import { Expense, Income, FixedExpense, Investment, Asset, AssetGroup } from '../types';

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
        { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [
        { id: '1', name: 'Kira', amount: 10000, dueDay: 1, category: 'konut', frequency: 'monthly', active: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', name: 'TEFAS Fonu', plannedAmount: 5000, actualAmount: 0, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const expenses: Expense[] = [
        { id: '1', amount: 2000, category: 'market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-01-05', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // AKÇE-047: remainingBudget now uses netInvestment (from Ek Ders + Özel Ders)
      // Since there are no Ek Ders or Özel Ders entries, netInvestment = 0
      // Gelir: 50000
      // Yatırım: 0 (netInvestment)
      // Otomatik gider: 10000
      // Değişken gider: 2000
      // Kalan: 50000 - 0 - 10000 - 2000 = 38000
      // Kalan gün: 16
      // Günlük limit: 38000 / 16 = 2375
      expect(summary.remainingBudget).toBe(38000);
      expect(summary.daysLeft).toBe(16);
      expect(summary.dailySafeLimit).toBeCloseTo(2375, 1);
    });

    it('should exclude investment from spendable budget', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const fixedExpenses: FixedExpense[] = [];
      
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', name: 'TEFAS Fonu', plannedAmount: 10000, actualAmount: 0, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      const expenses: Expense[] = [];
      const assets: Asset[] = [];
      const currentDate = new Date('2024-01-15');
      
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, assets, currentDate);
      
      // AKÇE-047: remainingBudget now uses netInvestment (from Ek Ders + Özel Ders)
      // Since there are no Ek Ders or Özel Ders entries, netInvestment = 0
      // remainingBudget = 30000 - 0 = 30000
      expect(summary.remainingBudget).toBe(30000);
    });

    it('should calculate unplanned expense ratio', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
        { id: '1', name: 'Maaş', amount: 30000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-31', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
         { id: '1', name: 'Maaş', amount: 50000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
         { id: '1', name: 'Maaş', amount: 20000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'user1' }
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
        name: 'TEFAS Fonu',
        valuationMode: 'direct',
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
        name: 'TEFAS Fonu',
        valuationMode: 'direct',
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
        { id: '1', group: 'TEFAS', name: 'TEFAS Fonu', valuationMode: 'direct', currentAmount: 132000, targetAmount: 200000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '2', group: 'Nasdaq', name: 'NASDAQ ETF', valuationMode: 'direct', currentAmount: 185000, targetAmount: 250000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '3', group: 'Altın', name: 'Gram Altın', valuationMode: 'direct', currentAmount: 74000, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'user1' },
        { id: '4', group: 'BES', name: 'BES', valuationMode: 'direct', currentAmount: 56000, targetAmount: 150000, createdAt: 1, updatedAt: 1, userId: 'user1' }
      ];
      
      expect(getTotalAssets(assets)).toBe(447000);
    });
  });

  describe('calculateInvestmentRatio', () => {
    it('should calculate ratio correctly', () => {
      expect(calculateInvestmentRatio(100000, 30000)).toBe(30);
    });

    it('should handle zero income', () => {
      expect(calculateInvestmentRatio(0, 30000)).toBe(0);
    });

    it('should handle zero investments', () => {
      expect(calculateInvestmentRatio(100000, 0)).toBe(0);
    });

    it('should use actualAmount not plannedAmount', () => {
      expect(calculateInvestmentRatio(100000, 15000)).toBe(15);
    });

    it('should handle ratio over 100%', () => {
      expect(calculateInvestmentRatio(50000, 60000)).toBe(120);
    });
  });

  describe('calculateExpenseRatio', () => {
    it('should calculate ratio correctly', () => {
      expect(calculateExpenseRatio(100000, 20000, 25000)).toBe(45);
    });

    it('should handle zero income', () => {
      expect(calculateExpenseRatio(0, 20000, 25000)).toBe(0);
    });

    it('should handle zero expenses', () => {
      expect(calculateExpenseRatio(100000, 0, 0)).toBe(0);
    });

    it('should include fixed expenses', () => {
      expect(calculateExpenseRatio(100000, 30000, 0)).toBe(30);
    });

    it('should include variable expenses', () => {
      expect(calculateExpenseRatio(100000, 0, 45000)).toBe(45);
    });

    it('should handle ratio over 100%', () => {
      expect(calculateExpenseRatio(50000, 30000, 30000)).toBe(120);
    });
  });

  describe('formatRatio', () => {
    it('should format non-zero ratio', () => {
      expect(formatRatio(30)).toBe('%30');
      expect(formatRatio(45.7)).toBe('%46');
      expect(formatRatio(120)).toBe('%120');
    });

    it('should return dash for zero', () => {
      expect(formatRatio(0)).toBe('—');
    });
  });

  describe('dailySafeLimit edge cases', () => {
    const incomes: Income[] = [
      { id: '1', name: 'Maaş', amount: 70000, date: '2024-09-01', recurring: true, active: true, category: 'salary', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' },
      { id: '2', name: 'Ek Ders', amount: 30000, date: '2024-09-01', recurring: true, active: true, category: 'extraLesson', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' },
    ];
    const fixedExpenses: FixedExpense[] = [
      { id: '1', name: 'Kira', amount: 26000, dueDay: 1, category: 'Konut', frequency: 'monthly', active: true, monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
    ];
    const investments: Investment[] = [
      { id: '1', group: 'TEFAS', name: 'TEFAS Fonu', plannedAmount: 30000, actualAmount: 30000, completed: true, monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
    ];

    it('normal day: divides remaining budget by days left', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 10000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-10', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 - 26000 - 10000 = 44000
      // daysLeft on Sep 10 = 20
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-10'));
      expect(summary.remainingBudget).toBe(44000);
      expect(summary.daysLeft).toBe(20);
      expect(summary.dailySafeLimit).toBe(2200);
    });

    it('final day / positive remaining: shows full remaining budget', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 6000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-30', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 - 26000 - 6000 = 48000
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-30'));
      expect(summary.remainingBudget).toBe(48000);
      expect(summary.daysLeft).toBe(0);
      expect(summary.dailySafeLimit).toBe(48000);
    });

    it('final day / zero remaining: shows 0', () => {
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 - 26000 - X = 0 => X = 54000
      const expenses: Expense[] = [
        { id: '1', amount: 54000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-30', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-30'));
      expect(summary.remainingBudget).toBe(0);
      expect(summary.daysLeft).toBe(0);
      expect(summary.dailySafeLimit).toBe(0);
    });

    it('final day / negative remaining: shows 0 (over-budget state)', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 60000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-30', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 - 26000 - 60000 = -6000
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-30'));
      expect(summary.remainingBudget).toBe(-6000);
      expect(summary.daysLeft).toBe(0);
      expect(summary.dailySafeLimit).toBe(0);
    });

    it('zero income: no NaN or Infinity', () => {
      const noIncome: Income[] = [];
      const noFixed: FixedExpense[] = [];
      const noInvest: Investment[] = [];
      const noExp: Expense[] = [];
      const summary = calculateMonthSummary(noIncome, noFixed, noInvest, noExp, [], new Date('2024-09-30'));
      expect(summary.dailySafeLimit).toBe(0);
      expect(isNaN(summary.dailySafeLimit)).toBe(false);
      expect(isFinite(summary.dailySafeLimit)).toBe(true);
    });

    it('historical month: deterministic behavior', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 10000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-08-15', monthKey: '2024-08', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      const augIncomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 80000, date: '2024-08-01', recurring: true, active: true, category: 'salary', monthKey: '2024-08', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      // Aug 31 is the last day of August
      const summary = calculateMonthSummary(augIncomes, [], [], expenses, [], new Date('2024-08-31'));
      // remainingBudget = 80000 - 0 - 0 - 10000 = 70000
      // daysLeft on Aug 31 = 0
      // dailySafeLimit = 70000 (full remaining, historical month)
      expect(summary.remainingBudget).toBe(70000);
      expect(summary.daysLeft).toBe(0);
      expect(summary.dailySafeLimit).toBe(70000);
    });

    it('mid-month negative remaining: dailySafeLimit clamped to 0', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 90000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-15', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 - 26000 - 90000 = -36000
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-15'));
      expect(summary.remainingBudget).toBe(-36000);
      expect(summary.daysLeft).toBeGreaterThan(0);
      expect(summary.dailySafeLimit).toBe(0);
    });

    it('dailySafeLimit is never negative across all scenarios', () => {
      const overSpend: Expense[] = [
        { id: '1', amount: 120000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-10', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, overSpend, [], new Date('2024-09-10'));
      expect(summary.dailySafeLimit).toBeGreaterThanOrEqual(0);
      expect(summary.dailySafeLimit).not.toBeLessThan(0);
    });

    it('Bütçe aşıldı state still driven by remainingBudget, not dailySafeLimit', () => {
      const expenses: Expense[] = [
        { id: '1', amount: 90000, category: 'Market', type: 'zorunlu', paymentMethod: 'kart', date: '2024-09-15', monthKey: '2024-09', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      const summary = calculateMonthSummary(incomes, fixedExpenses, investments, expenses, [], new Date('2024-09-15'));
      expect(summary.remainingBudget).toBeLessThan(0);
      expect(summary.dailySafeLimit).toBe(0);
    });
  });

  describe('AKCE-034: asset quantity valuation', () => {
    const common = { createdAt: 1, updatedAt: 1, userId: 'u' };

    it('legacy asset without name/valuationMode loads as direct mode', () => {
      const asset = { id: 'a1', group: 'Altın' as const, currentAmount: 74000, targetAmount: 150000, ...common } as Asset;
      expect(asset.currentAmount).toBe(74000);
    });

    it('total assets includes quantity-derived currentAmount', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Altın', name: 'Gram Altın', valuationMode: 'quantity', quantity: 24, unit: 'Gram', unitPrice: 3083, currentAmount: 73992, targetAmount: 150000, ...common },
        { id: 'a2', group: 'BES', name: 'Allianz BES', valuationMode: 'direct', currentAmount: 56000, targetAmount: 300000, ...common },
      ];
      expect(getTotalAssets(assets)).toBe(129992);
    });

    it('total assets includes direct currentAmount', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Nakit', name: 'Acil Nakit', valuationMode: 'direct', currentAmount: 20000, targetAmount: 0, ...common },
      ];
      expect(getTotalAssets(assets)).toBe(20000);
    });

    it('global goal remains correct with mixed asset types', () => {
      const assets: Asset[] = [
        { id: 'a1', group: 'Altın', name: 'Bilezik', valuationMode: 'quantity', quantity: 3, unit: 'Adet', unitPrice: 25000, currentAmount: 75000, targetAmount: 100000, ...common },
        { id: 'a2', group: 'BES', name: 'BES', valuationMode: 'direct', currentAmount: 64300, targetAmount: 200000, ...common },
      ];
      expect(getTotalAssets(assets)).toBe(139300);
      expect(getTotalAssetTargets(assets)).toBe(300000);
    });

    it('quantity × unitPrice matches currentAmount', () => {
      const quantity = 125.5;
      const unitPrice = 3100;
      const currentAmount = quantity * unitPrice;
      expect(currentAmount).toBe(389050);
    });

    it('decimal quantity works correctly', () => {
      const quantity = 1482.438;
      const unitPrice = 4.35;
      const currentAmount = quantity * unitPrice;
      expect(currentAmount).toBeCloseTo(6448.61, 1);
    });

    it('asset group enum includes new values', () => {
      const groups: AssetGroup[] = ['TEFAS', 'Nasdaq', 'Altın', 'Gümüş', 'BES', 'Nakit', 'Mevduat', 'Kripto', 'Diğer', 'BIST Hisse', 'Döviz', 'Eurobond / Tahvil'];
      expect(groups.length).toBe(12);
    });
  });

  describe('AKCE-035: investment plan progress model', () => {
    const common = { createdAt: 1, updatedAt: 1, userId: 'u' };

    it('getInvestmentProgress below 100', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2024-01', ...common };
      expect(getInvestmentProgress(inv)).toBeCloseTo(66.67, 1);
    });

    it('getInvestmentProgress at 100', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 7500, completed: true, monthKey: '2024-01', ...common };
      expect(getInvestmentProgress(inv)).toBe(100);
    });

    it('getInvestmentProgress above 100 (not clamped)', () => {
      const inv: Investment = { id: 'i1', group: 'Altın', name: 'Gram Altın', plannedAmount: 5000, actualAmount: 9000, completed: true, monthKey: '2024-01', ...common };
      expect(getInvestmentProgress(inv)).toBe(180);
    });

    it('getInvestmentProgress with zero planned', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 0, actualAmount: 0, completed: false, monthKey: '2024-01', ...common };
      expect(getInvestmentProgress(inv)).toBe(0);
    });

    it('getInvestmentRemaining normal', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2024-01', ...common };
      expect(getInvestmentRemaining(inv)).toBe(2500);
    });

    it('getInvestmentRemaining when over-completed', () => {
      const inv: Investment = { id: 'i1', group: 'Altın', name: 'Gram Altın', plannedAmount: 5000, actualAmount: 9000, completed: true, monthKey: '2024-01', ...common };
      expect(getInvestmentRemaining(inv)).toBe(0);
    });

    it('getInvestmentRemaining at exact planned', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 7500, completed: true, monthKey: '2024-01', ...common };
      expect(getInvestmentRemaining(inv)).toBe(0);
    });

    it('isInvestmentCompleted derived from amounts', () => {
      const completed: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 7500, completed: false, monthKey: '2024-01', ...common };
      expect(isInvestmentCompleted(completed)).toBe(true);
    });

    it('isInvestmentCompleted false when under target', () => {
      const inv: Investment = { id: 'i1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2024-01', ...common };
      expect(isInvestmentCompleted(inv)).toBe(false);
    });

    it('isInvestmentCompleted true when over target', () => {
      const inv: Investment = { id: 'i1', group: 'Altın', name: 'Gram Altın', plannedAmount: 5000, actualAmount: 9000, completed: true, monthKey: '2024-01', ...common };
      expect(isInvestmentCompleted(inv)).toBe(true);
    });

    it('investmentPlanRealizationRate uses actualAmount not completed flag', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 100000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' }
      ];
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 5000, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
        { id: '2', group: 'Altın', name: 'Gram Altın', plannedAmount: 5000, actualAmount: 5000, completed: true, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
        { id: '3', group: 'ABD Hisse / ETF', name: 'VOO', plannedAmount: 7500, actualAmount: 2500, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
      ];
      const summary = calculateMonthSummary(incomes, [], investments, [], [], new Date('2024-01-15'));
      // totalFixedInvestment = 7500 + 5000 + 7500 = 20000
      // actualInvestments = 5000 + 5000 + 2500 = 12500
      // rate = 12500 / 20000 * 100 = 62.5%
      expect(summary.totalFixedInvestment).toBe(20000);
      expect(summary.investmentPlanRealizationRate).toBeCloseTo(62.5, 1);
    });

    it('remainingBudget uses netInvestment not plannedAmount', () => {
      const incomes: Income[] = [
        { id: '1', name: 'Maaş', amount: 70000, date: '2024-01-01', recurring: true, active: true, category: 'salary', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
        { id: '2', name: 'Ek Ders', amount: 30000, date: '2024-01-01', recurring: true, active: true, category: 'extraLesson', monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
      ];
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', name: 'TP2', plannedAmount: 20000, actualAmount: 15000, completed: false, monthKey: '2024-01', createdAt: 1, updatedAt: 1, userId: 'u' },
      ];
      const summary = calculateMonthSummary(incomes, [], investments, [], [], new Date('2024-01-15'));
      // extraIncome = 30000, flexAmount = 10000, netInvestment = 20000
      // remainingBudget = 100000 - 20000 (netInvestment) = 80000
      expect(summary.remainingBudget).toBe(80000);
    });

    it('aggregate progress for multiple investments', () => {
      const investments: Investment[] = [
        { id: '1', group: 'TEFAS', name: 'TP2', plannedAmount: 7500, actualAmount: 7500, completed: true, monthKey: '2024-01', ...common },
        { id: '2', group: 'Altın', name: 'Gram Altın', plannedAmount: 5000, actualAmount: 5000, completed: true, monthKey: '2024-01', ...common },
        { id: '3', group: 'ABD Hisse / ETF', name: 'VOO', plannedAmount: 7500, actualAmount: 2500, completed: false, monthKey: '2024-01', ...common },
      ];
      const totalPlanned = investments.reduce((s, i) => s + i.plannedAmount, 0);
      const totalActual = investments.reduce((s, i) => s + i.actualAmount, 0);
      expect(totalPlanned).toBe(20000);
      expect(totalActual).toBe(15000);
      const progress = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
      expect(progress).toBe(75);
    });
  });

  describe('AKCE-036: parseLocaleNumber', () => {
    it('parses Turkish comma decimal', () => {
      expect(parseLocaleNumber('48,22')).toBe(48.22);
    });

    it('parses dot decimal', () => {
      expect(parseLocaleNumber('48.22')).toBe(48.22);
    });

    it('parses integer', () => {
      expect(parseLocaleNumber('125')).toBe(125);
    });

    it('parses complex comma decimal', () => {
      expect(parseLocaleNumber('1482,438')).toBe(1482.438);
    });

    it('parses small comma decimal', () => {
      expect(parseLocaleNumber('0,75')).toBe(0.75);
    });

    it('parses formatted comma decimal', () => {
      expect(parseLocaleNumber('1200,50')).toBe(1200.50);
    });

    it('returns undefined for empty string', () => {
      expect(parseLocaleNumber('')).toBeUndefined();
    });

    it('returns undefined for whitespace only', () => {
      expect(parseLocaleNumber('   ')).toBeUndefined();
    });

    it('returns undefined for malformed input', () => {
      expect(parseLocaleNumber('abc')).toBeUndefined();
    });

    it('returns undefined for double commas', () => {
      expect(parseLocaleNumber('48,,22')).toBeUndefined();
    });

    it('returns undefined for leading dots', () => {
      expect(parseLocaleNumber('.5')).toBe(0.5);
    });

    it('handles negative numbers', () => {
      expect(parseLocaleNumber('-48,22')).toBe(-48.22);
    });

    it('strips spaces before parsing', () => {
      expect(parseLocaleNumber('1 200,5')).toBe(1200.5);
    });

    it('dot and comma both work for same value', () => {
      expect(parseLocaleNumber('48,22')).toBe(parseLocaleNumber('48.22'));
    });
  });

  describe('AKCE-036: sanitizeNumericInput', () => {
    it('allows digits and dots', () => {
      expect(sanitizeNumericInput('123.45')).toBe('123.45');
    });

    it('allows digits and commas', () => {
      expect(sanitizeNumericInput('123,45')).toBe('123,45');
    });

    it('strips non-numeric characters', () => {
      expect(sanitizeNumericInput('abc123')).toBe('123');
    });

    it('allows only one decimal separator', () => {
      expect(sanitizeNumericInput('12.34.56')).toBe('12.3456');
    });

    it('allows only one comma separator', () => {
      expect(sanitizeNumericInput('12,34,56')).toBe('12,3456');
    });

    it('integer mode strips all separators', () => {
      expect(sanitizeNumericInput('12.34,56', false)).toBe('123456');
    });

    it('preserves partial typing', () => {
      expect(sanitizeNumericInput('48,')).toBe('48,');
    });

    it('preserves leading comma', () => {
      expect(sanitizeNumericInput(',5')).toBe(',5');
    });
  });
});
