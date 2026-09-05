import type { Income, FixedExpense, Expense, Asset, AssetList } from './types';
import { INCOME_CATEGORY_LABELS } from './types';
import { getExtraIncome, getFlexAmount, getNetInvestment, getEmergencyFundValue, getInvestmentAllocation } from './financeEngine';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  percentage: number;
}

const CHART_COLORS = [
  '#182433', // Night Navy
  '#A9874C', // Muted Brass
  '#A74737', // Coral
  '#4A6FA5', // Teal
  '#6A4C93', // Violet
  '#7A8B3A', // Olive
  '#C46B3D', // Terracotta
  '#3A8FB7', // Sky Blue
  '#7B4A7A', // Plum
  '#D4A537', // Amber
];

function assignColors(slices: Omit<DonutSlice, 'color' | 'percentage'>[]): DonutSlice[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return slices.map((slice, index) => ({
    ...slice,
    color: CHART_COLORS[index % CHART_COLORS.length],
    percentage: total > 0 ? (slice.value / total) * 100 : 0,
  }));
}

export function getIncomeChartData(incomes: Income[], monthKey: string): DonutSlice[] {
  const monthIncomes = incomes.filter(i => i.monthKey === monthKey);
  const categoryTotals: Record<string, number> = {};

  for (const income of monthIncomes) {
    const category = income.category || 'other';
    const label = INCOME_CATEGORY_LABELS[category as keyof typeof INCOME_CATEGORY_LABELS] || 'Diğer';
    categoryTotals[label] = (categoryTotals[label] || 0) + income.amount;
  }

  const slices = Object.entries(categoryTotals)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value }));

  return assignColors(slices);
}

export function getExpenseChartData(
  fixedExpenses: FixedExpense[],
  expenses: Expense[],
  monthKey: string
): DonutSlice[] {
  const monthFixed = fixedExpenses.filter(f => f.monthKey === monthKey && f.active);
  const monthExpenses = expenses.filter(e => e.monthKey === monthKey);

  const categoryTotals: Record<string, number> = {};

  const fixedTotal = monthFixed.reduce((sum, f) => sum + f.amount, 0);
  if (fixedTotal > 0) {
    categoryTotals['Otomatik Gider'] = fixedTotal;
  }

  for (const expense of monthExpenses) {
    const category = expense.category?.trim() ? expense.category.trim() : 'Kategorisiz';
    categoryTotals[category] = (categoryTotals[category] || 0) + expense.amount;
  }

  const slices = Object.entries(categoryTotals)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value }));

  return assignColors(slices);
}

export function getSavingsChartData(
  incomes: Income[],
  assets: Asset[],
  assetLists: AssetList[],
  monthKey: string
): DonutSlice[] {
  const extraIncome = getExtraIncome(incomes, monthKey);
  const netInvestment = getNetInvestment(extraIncome);

  if (netInvestment <= 0) {
    return [];
  }

  const emergencyFundValue = getEmergencyFundValue(assets, assetLists);
  const allocation = getInvestmentAllocation(netInvestment, emergencyFundValue);

  const slices = [
    { label: 'Acil Fon TP2', value: allocation.tp2 },
    { label: 'Hisse Senedi Fonları', value: allocation.hisse },
    { label: 'Altın-Gümüş', value: allocation.altinGumus },
    { label: 'Nasdaq', value: allocation.nasdaq },
  ].filter(s => s.value > 0);

  return assignColors(slices);
}

export function getBudgetSummaryChartData(
  incomes: Income[],
  fixedExpenses: FixedExpense[],
  expenses: Expense[],
  monthKey: string
): DonutSlice[] {
  const monthIncomes = incomes.filter(i => i.monthKey === monthKey);
  const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0);

  if (totalIncome <= 0) {
    return [];
  }

  const monthFixed = fixedExpenses.filter(f => f.monthKey === monthKey && f.active);
  const totalAutomaticExpenses = monthFixed.reduce((sum, f) => sum + f.amount, 0);
  const monthExpenses = expenses.filter(e => e.monthKey === monthKey);
  const totalVariableExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = totalAutomaticExpenses + totalVariableExpenses;

  const extraIncome = getExtraIncome(incomes, monthKey);
  const flexAmount = getFlexAmount(extraIncome);
  const netInvestment = getNetInvestment(extraIncome);

  const serbestKalan = Math.max(0, totalIncome - totalExpenses - netInvestment - flexAmount);

  const slices = [
    { label: 'Gider', value: totalExpenses },
    { label: 'Birikim', value: netInvestment },
    { label: 'Hediye-Bağış', value: flexAmount },
    { label: 'Serbest Kalan', value: serbestKalan },
  ].filter(s => s.value > 0);

  return assignColors(slices);
}

export function getIncomeChartCenter(incomes: Income[], monthKey: string): { value: number; label: string } {
  const monthIncomes = incomes.filter(i => i.monthKey === monthKey);
  const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0);
  return { value: totalIncome, label: 'Toplam Gelir' };
}

export function getExpenseChartCenter(fixedExpenses: FixedExpense[], expenses: Expense[], monthKey: string): { value: number; label: string } {
  const monthFixed = fixedExpenses.filter(f => f.monthKey === monthKey && f.active);
  const totalAutomaticExpenses = monthFixed.reduce((sum, f) => sum + f.amount, 0);
  const monthExpenses = expenses.filter(e => e.monthKey === monthKey);
  const totalVariableExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  return { value: totalAutomaticExpenses + totalVariableExpenses, label: 'Toplam Gider' };
}

export function getSavingsChartCenter(incomes: Income[], _assets: Asset[], _assetLists: AssetList[], monthKey: string): { value: number; label: string } {
  const extraIncome = getExtraIncome(incomes, monthKey);
  const netInvestment = getNetInvestment(extraIncome);
  return { value: netInvestment, label: 'Net Yatırım' };
}

export function getBudgetSummaryChartCenter(incomes: Income[], monthKey: string): { value: number; label: string } {
  const monthIncomes = incomes.filter(i => i.monthKey === monthKey);
  const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0);
  return { value: totalIncome, label: 'Toplam Gelir' };
}