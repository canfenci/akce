import type { Asset, AssetList, AssetSnapshot, AssetGroup, AssetUnit, CategoryBudget, Expense, FixedExpense, Goal, Income, Investment, InvestmentGroup, PriceSource } from '../domain/types';
import { isMonthKey } from '../domain/month';
import { FinanceRepositoryError, type FinanceCollection, type FinanceCollectionMap } from './financeRepository';

export type FirestoreDto = Record<string, unknown> & {
  schemaVersion: 2;
  deviceId: string;
  serverUpdatedAt: unknown;
  createdAt: number;
  updatedAt: number;
};

const invalid = (field: string): never => { throw new FinanceRepositoryError('invalid-data', `Firestore belgesindeki “${field}” alanı geçersiz.`); };
const stringValue = (data: Record<string, unknown>, key: string) => typeof data[key] === 'string' ? data[key] as string : invalid(key);
const numberValue = (data: Record<string, unknown>, key: string) => typeof data[key] === 'number' && Number.isFinite(data[key]) ? data[key] as number : invalid(key);
const booleanValue = (data: Record<string, unknown>, key: string) => typeof data[key] === 'boolean' ? data[key] as boolean : invalid(key);
const optionalString = (data: Record<string, unknown>, key: string) => data[key] === undefined || data[key] === null ? undefined : stringValue(data, key);
const monthKeyValue = (data: Record<string, unknown>) => {
  const value = stringValue(data, 'monthKey');
  return isMonthKey(value) ? value : invalid('monthKey');
};
const enumValue = <T extends string>(data: Record<string, unknown>, key: string, values: readonly T[]) => {
  const value = stringValue(data, key);
  return values.includes(value as T) ? value as T : invalid(key);
};

function metadataNumber(data: Record<string, unknown>, key: 'createdAt' | 'updatedAt') {
  const value = data[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  return invalid(key);
}

export function toFirestoreDto(value: FinanceCollectionMap[FinanceCollection], deviceId: string, serverUpdatedAt: unknown, now = Date.now()): FirestoreDto {
  const source = value as unknown as Record<string, unknown>;
  const dto: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key !== 'id' && key !== 'userId' && item !== undefined) dto[key] = item;
  }
  return {
    ...dto,
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : now,
    schemaVersion: 2,
    deviceId,
    serverUpdatedAt,
  } as FirestoreDto;
}

export function fromFirestoreDto<K extends FinanceCollection>(collection: K, id: string, uid: string, data: Record<string, unknown>): FinanceCollectionMap[K] {
  if (data.schemaVersion !== 2) invalid('schemaVersion');
  if (typeof data.deviceId !== 'string' || !data.deviceId) invalid('deviceId');
  let value: Expense | Income | FixedExpense | Investment | CategoryBudget | Asset | Goal | AssetSnapshot;
  switch (collection) {
    case 'expenses': value = { id, userId: uid, amount: numberValue(data, 'amount'), category: stringValue(data, 'category'), type: enumValue(data, 'type', ['zorunlu', 'isteğe bağlı', 'plansız']), paymentMethod: enumValue(data, 'paymentMethod', ['kart', 'nakit']), note: optionalString(data, 'note'), date: stringValue(data, 'date'), monthKey: monthKeyValue(data), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') }; break;
    case 'incomes': value = { id, userId: uid, name: stringValue(data, 'name'), amount: numberValue(data, 'amount'), date: stringValue(data, 'date'), recurring: booleanValue(data, 'recurring'), active: booleanValue(data, 'active'), monthKey: monthKeyValue(data), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') }; break;
    case 'fixedExpenses': value = { id, userId: uid, name: stringValue(data, 'name'), amount: numberValue(data, 'amount'), dueDay: numberValue(data, 'dueDay'), category: stringValue(data, 'category'), frequency: enumValue(data, 'frequency', ['monthly', 'yearly']), active: booleanValue(data, 'active'), monthKey: monthKeyValue(data), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') }; break;
    case 'investments': {
      const groupRaw = stringValue(data, 'group');
      const investmentGroupMap: Record<string, InvestmentGroup> = {
        TEFAS: 'TEFAS', Nasdaq: 'ABD Hisse / ETF', Altın: 'Altın', Gümüş: 'Gümüş', BES: 'BES',
        'BIST Hisse': 'BIST Hisse', 'ABD Hisse / ETF': 'ABD Hisse / ETF', Döviz: 'Döviz',
        'Eurobond / Tahvil': 'Eurobond / Tahvil', Kripto: 'Kripto', Mevduat: 'Mevduat', Diğer: 'Diğer',
      };
      const group = investmentGroupMap[groupRaw];
      if (!group) invalid('group');
      const name = optionalString(data, 'name') ?? '';
      value = { id, userId: uid, group, name, plannedAmount: numberValue(data, 'plannedAmount'), actualAmount: numberValue(data, 'actualAmount'), completed: booleanValue(data, 'completed'), completedDate: optionalString(data, 'completedDate'), note: optionalString(data, 'note'), monthKey: monthKeyValue(data), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') };
      break;
    }
    case 'categoryBudgets': value = { id, name: stringValue(data, 'name'), limit: numberValue(data, 'limit'), color: stringValue(data, 'color'), monthKey: monthKeyValue(data) }; break;
    case 'assets': {
      const group = enumValue(data, 'group', ['TEFAS', 'Nasdaq', 'Altın', 'Gümüş', 'BES', 'Nakit', 'Mevduat', 'Kripto', 'Diğer', 'BIST Hisse', 'Döviz', 'Eurobond / Tahvil'] as readonly AssetGroup[]);
      const name = optionalString(data, 'name') ?? '';
      const valuationMode = (data.valuationMode === 'quantity' || data.valuationMode === 'direct') ? data.valuationMode as 'quantity' | 'direct' : 'direct';
      const priceSource: PriceSource = (data.priceSource === 'manual' || data.priceSource === 'rate') ? data.priceSource as PriceSource : 'manual';
      const rateKey = optionalString(data, 'rateKey') as Asset['rateKey'];
      const assetListId = optionalString(data, 'assetListId');
      const cur = numberValue(data, 'currentAmount');
      let quantity = typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? data.quantity : undefined;
      let unit = (typeof data.unit === 'string' && ['Adet', 'Gram', 'Pay', 'Lot', 'TL', 'USD', 'EUR', 'GBP', 'Ons', 'Diğer'].includes(data.unit)) ? data.unit as AssetUnit : undefined;
      let unitPrice = typeof data.unitPrice === 'number' && Number.isFinite(data.unitPrice) ? data.unitPrice : undefined;
      if (valuationMode === 'direct' && quantity === undefined) {
        quantity = 1;
        unit = 'Adet';
        unitPrice = cur;
      }
      value = { id, userId: uid, group, name, valuationMode, priceSource, rateKey, assetListId, quantity, unit, unitPrice, currentAmount: cur, targetAmount: numberValue(data, 'targetAmount'), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') };
      break;
    }
    case 'goals': value = { id, userId: uid, assetGroupId: stringValue(data, 'assetGroupId'), targetAmount: numberValue(data, 'targetAmount'), createdAt: metadataNumber(data, 'createdAt'), updatedAt: metadataNumber(data, 'updatedAt') }; break;
    case 'assetSnapshots': value = { id, assetId: stringValue(data, 'assetId'), monthKey: monthKeyValue(data), amount: numberValue(data, 'amount'), createdAt: metadataNumber(data, 'createdAt') }; break;
  }
  return value as FinanceCollectionMap[K];
}

export function fromAssetListDto(id: string, uid: string, data: Record<string, unknown>): AssetList {
  if (data.schemaVersion !== 2) invalid('schemaVersion');
  return {
    id,
    userId: uid,
    name: stringValue(data, 'name'),
    createdAt: metadataNumber(data, 'createdAt'),
    updatedAt: metadataNumber(data, 'updatedAt'),
  };
}

export function toAssetListDto(value: AssetList, deviceId: string, serverUpdatedAt: unknown): FirestoreDto {
  return {
    name: value.name,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    schemaVersion: 2,
    deviceId,
    serverUpdatedAt,
  } as FirestoreDto;
}
