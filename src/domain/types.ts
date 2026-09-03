export interface Expense {
  id: string;
  amount: number;
  category: string;
  type: 'zorunlu' | 'isteğe bağlı' | 'plansız';
  paymentMethod: 'kart' | 'nakit';
  note?: string;
  date: string;
  monthKey: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface Income {
  id: string;
  name: string;
  amount: number;
  date: string;
  recurring: boolean;
  active: boolean;
  monthKey: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  category: string;
  frequency: 'monthly' | 'yearly';
  active: boolean;
  monthKey: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export type InvestmentGroup = 'TEFAS' | 'BIST Hisse' | 'ABD Hisse / ETF' | 'Altın' | 'Gümüş' | 'Döviz' | 'BES' | 'Eurobond / Tahvil' | 'Kripto' | 'Mevduat' | 'Diğer';

export const INVESTMENT_GROUPS: InvestmentGroup[] = ['TEFAS', 'BIST Hisse', 'ABD Hisse / ETF', 'Altın', 'Gümüş', 'Döviz', 'BES', 'Eurobond / Tahvil', 'Kripto', 'Mevduat', 'Diğer'];

export const INVESTMENT_GROUP_LABELS: Record<InvestmentGroup, string> = {
  TEFAS: 'TEFAS / Fon',
  'BIST Hisse': 'BIST Hisse',
  'ABD Hisse / ETF': 'ABD Hisse / ETF',
  Altın: 'Altın',
  Gümüş: 'Gümüş',
  Döviz: 'Döviz',
  BES: 'BES',
  'Eurobond / Tahvil': 'Eurobond / Tahvil',
  Kripto: 'Kripto',
  Mevduat: 'Mevduat',
  Diğer: 'Diğer',
};

export interface Investment {
  id: string;
  group: InvestmentGroup;
  name: string;
  plannedAmount: number;
  actualAmount: number;
  completed: boolean;
  completedDate?: string;
  note?: string;
  monthKey: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export type AssetGroup = 'TEFAS' | 'Nasdaq' | 'Altın' | 'Gümüş' | 'BES' | 'Nakit' | 'Mevduat' | 'Kripto' | 'Diğer' | 'BIST Hisse' | 'Döviz' | 'Eurobond / Tahvil';

export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
  TEFAS: 'TEFAS / Fon',
  Nasdaq: 'ABD Hisse / ETF',
  Altın: 'Altın',
  Gümüş: 'Gümüş',
  BES: 'BES',
  Nakit: 'Nakit',
  Mevduat: 'Mevduat',
  Kripto: 'Kripto',
  Diğer: 'Diğer',
  'BIST Hisse': 'BIST Hisse',
  Döviz: 'Döviz',
  'Eurobond / Tahvil': 'Eurobond / Tahvil',
};

export const ASSET_GROUPS: AssetGroup[] = ['Altın', 'TEFAS', 'BIST Hisse', 'Nasdaq', 'Döviz', 'Gümüş', 'BES', 'Eurobond / Tahvil', 'Nakit', 'Mevduat', 'Kripto', 'Diğer'];

export type ValuationMode = 'quantity' | 'direct';

export type AssetUnit = 'Adet' | 'Gram' | 'Pay' | 'Lot' | 'TL' | 'USD' | 'EUR' | 'GBP' | 'Ons' | 'Diğer';

export const ASSET_UNITS: AssetUnit[] = ['Adet', 'Gram', 'Pay', 'Lot', 'TL', 'USD', 'EUR', 'GBP', 'Ons', 'Diğer'];

export const ASSET_UNIT_LABELS: Record<AssetUnit, string> = {
  Adet: 'Adet',
  Gram: 'Gram',
  Pay: 'Pay',
  Lot: 'Lot',
  TL: 'TL',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  Ons: 'Ons',
  Diğer: 'Diğer',
};

export interface Asset {
  id: string;
  group: AssetGroup;
  name: string;
  valuationMode: ValuationMode;
  quantity?: number;
  unit?: AssetUnit;
  unitPrice?: number;
  currentAmount: number;
  targetAmount: number;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface Goal {
  id: string;
  assetGroupId: string;
  targetAmount: number;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface CoachInsight {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  metrics: {
    dailyLimit: number;
    sevenDayAverage: number;
    remainingBudget: number;
    daysLeft: number;
    monthlyTempo: number;
    unplannedRatio: number;
    tefasProgress: number;
  };
  createdAt: number;
  userId: string;
}

export interface MonthSummary {
  monthKey: string;
  totalIncome: number;
  totalFixedInvestment: number;
  totalAutomaticExpenses: number;
  totalVariableExpenses: number;
  remainingBudget: number;
  daysLeft: number;
  dailySafeLimit: number;
  monthProgress: number;
  budgetConsumptionRate: number;
  threeDayAverage: number;
  sevenDayAverage: number;
  unplannedRatio: number;
  monthEndEstimate: number;
  investmentPlanRealizationRate: number;
}

export interface UserProfile {
  uid: string;
  displayName?: string;
  email?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  userId: string;
  currency: string;
  monthStartDay: number;
  showOnboarding: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryBudget {
  id: string;
  name: string;
  limit: number;
  color: string;
  monthKey: string;
}

export interface AssetSnapshot {
  id: string;
  assetId: string;
  monthKey: string;
  amount: number;
  createdAt: number;
}
