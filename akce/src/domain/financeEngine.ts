import { Expense, Income, FixedExpense, Investment, Asset, MonthSummary } from '../domain/types';

export function getMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getDaysLeftInMonth(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  return daysInMonth - date.getDate();
}

export function getMonthProgress(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  return (date.getDate() / daysInMonth) * 100;
}

export function calculateMonthSummary(
  incomes: Income[],
  fixedExpenses: FixedExpense[],
  investments: Investment[],
  expenses: Expense[],
  _assets: Asset[],
  currentDate: Date = new Date()
): MonthSummary {
  const monthKey = getMonthKey(currentDate);
  
  // Toplam gelir (aktif gelirler)
  const totalIncome = incomes
    .filter(i => i.active && i.monthKey === monthKey)
    .reduce((sum, i) => sum + i.amount, 0);
  
  // Toplam sabit yatırım (planlanan)
  const totalFixedInvestment = investments
    .filter(inv => inv.monthKey === monthKey)
    .reduce((sum, inv) => sum + inv.plannedAmount, 0);
  
  // Toplam otomatik giderler (aktif sabit giderler)
  const totalAutomaticExpenses = fixedExpenses
    .filter(fe => fe.active && fe.monthKey === monthKey)
    .reduce((sum, fe) => sum + fe.amount, 0);
  
  // Toplam gerçekleşmiş değişken giderler
  const totalVariableExpenses = expenses
    .filter(e => e.monthKey === monthKey)
    .reduce((sum, e) => sum + e.amount, 0);
  
  // Kalan serbest bütçe
  const remainingBudget = totalIncome - totalFixedInvestment - totalAutomaticExpenses - totalVariableExpenses;
  
  // Kalan gün sayısı
  const daysLeft = getDaysLeftInMonth(currentDate);
  
  // Günlük güvenli harcama limiti
  const dailySafeLimit = daysLeft > 0 ? remainingBudget / daysLeft : 0;
  
  // Ay ilerleme oranı
  const monthProgress = getMonthProgress(currentDate);
  
  // Bütçe tüketim oranı
  const budgetConsumptionRate = totalIncome > 0 
    ? ((totalFixedInvestment + totalAutomaticExpenses + totalVariableExpenses) / totalIncome) * 100 
    : 0;
  
  // Son 3 günlük ortalama harcama
  const threeDaysAgo = new Date(currentDate);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const last3DaysExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    return expenseDate >= threeDaysAgo && expenseDate <= currentDate;
  });
  const threeDayAverage = last3DaysExpenses.length > 0
    ? last3DaysExpenses.reduce((sum, e) => sum + e.amount, 0) / Math.min(last3DaysExpenses.length, 3)
    : 0;
  
  // Son 7 günlük ortalama harcama
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const last7DaysExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    return expenseDate >= sevenDaysAgo && expenseDate <= currentDate;
  });
  const sevenDayAverage = last7DaysExpenses.length > 0
    ? last7DaysExpenses.reduce((sum, e) => sum + e.amount, 0) / Math.min(last7DaysExpenses.length, 7)
    : 0;
  
  // Plansız harcama oranı
  const unplannedExpenses = expenses.filter(e => e.type === 'plansız' && e.monthKey === monthKey);
  const unplannedRatio = totalVariableExpenses > 0
    ? (unplannedExpenses.reduce((sum, e) => sum + e.amount, 0) / totalVariableExpenses) * 100
    : 0;
  
  // Ay sonu harcama tahmini
  const monthEndEstimate = totalVariableExpenses + (dailySafeLimit * daysLeft);
  
  // Yatırım planı gerçekleşme oranı
  const actualInvestments = investments
    .filter(inv => inv.monthKey === monthKey && inv.completed)
    .reduce((sum, inv) => sum + inv.actualAmount, 0);
  const investmentPlanRealizationRate = totalFixedInvestment > 0
    ? (actualInvestments / totalFixedInvestment) * 100
    : 0;
  
  return {
    monthKey,
    totalIncome,
    totalFixedInvestment,
    totalAutomaticExpenses,
    totalVariableExpenses,
    remainingBudget,
    daysLeft,
    dailySafeLimit,
    monthProgress,
    budgetConsumptionRate,
    threeDayAverage,
    sevenDayAverage,
    unplannedRatio,
    monthEndEstimate,
    investmentPlanRealizationRate
  };
}

export function formatCurrency(amount: number, currency: string = 'TL'): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount) + ' ' + currency;
}

export function formatPercentage(value: number): string {
  return '%' + new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

export function getCategoryUsageRate(
  category: string,
  expenses: Expense[],
  monthKey: string,
  totalBudget: number
): number {
  const categoryExpenses = expenses
    .filter(e => e.category === category && e.monthKey === monthKey)
    .reduce((sum, e) => sum + e.amount, 0);
  
  return totalBudget > 0 ? (categoryExpenses / totalBudget) * 100 : 0;
}

export function getAssetProgress(asset: Asset): number {
  if (asset.targetAmount === 0) return 0;
  return (asset.currentAmount / asset.targetAmount) * 100;
}

export function getTotalAssets(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + asset.currentAmount, 0);
}

export function getTotalAssetTargets(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + asset.targetAmount, 0);
}
