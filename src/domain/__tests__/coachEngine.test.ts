import { describe, expect, it } from 'vitest';
import { RuleBasedCoach } from '../coachEngine';
import type { MonthSummary } from '../types';

const summary: MonthSummary = {
  monthKey: '2026-09', totalIncome: 100000, totalFixedInvestment: 20000,
  totalAutomaticExpenses: 25000, totalVariableExpenses: 15000, remainingBudget: 40000,
  daysLeft: 20, dailySafeLimit: 2000, monthProgress: 30, budgetConsumptionRate: 60,
  threeDayAverage: 1700, sevenDayAverage: 1400, unplannedRatio: 25,
  monthEndEstimate: 55000, investmentPlanRealizationRate: 50,
  extraIncome: 35000, flexAmount: 10000, netInvestment: 25000,
};

describe('RuleBasedCoach', () => {
  it('warns when budget runs ahead of time and unplanned spending is high', () => {
    const advice = new RuleBasedCoach().getAdvice(summary);
    expect(advice[0].tone).toBe('warning');
    expect(advice.some(item => item.title === 'Plansız harcama sinyali')).toBe(true);
  });

  it('recognizes a completed investment plan', () => {
    const advice = new RuleBasedCoach().getAdvice({ ...summary, investmentPlanRealizationRate: 100 });
    expect(advice.some(item => item.title === 'Gelecek finanse edildi')).toBe(true);
  });
});
