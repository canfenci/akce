import { isMonthKey } from '../domain/month';
import type { FinanceCollection } from './financeRepository';

const monthlyCollections = new Set<FinanceCollection>(['expenses', 'incomes', 'fixedExpenses', 'investments', 'categoryBudgets']);

function assertSegment(value: string, label: string) {
  if (!value || value.includes('/')) throw new Error(`Geçersiz Firestore ${label}.`);
}

export function userPath(uid: string) {
  assertSegment(uid, 'kullanıcı kimliği');
  return `users/${uid}`;
}

export function monthPath(uid: string, monthKey: string) {
  if (!isMonthKey(monthKey)) throw new Error('Geçersiz Firestore ay anahtarı.');
  return `${userPath(uid)}/months/${monthKey}`;
}

export function monthlyCollectionPath(uid: string, monthKey: string, collection: FinanceCollection) {
  if (!monthlyCollections.has(collection)) throw new Error('Geçersiz aylık Firestore koleksiyonu.');
  return `${monthPath(uid, monthKey)}/${collection}`;
}

export function monthlyDocumentPath(uid: string, monthKey: string, collection: FinanceCollection, id: string) {
  assertSegment(id, 'belge kimliği');
  return `${monthlyCollectionPath(uid, monthKey, collection)}/${id}`;
}

export function globalCollectionPath(uid: string, collection: 'assets' | 'goals' | 'assetSnapshots') {
  return `${userPath(uid)}/${collection}`;
}

export function globalDocumentPath(uid: string, collection: 'assets' | 'goals' | 'assetSnapshots', id: string) {
  assertSegment(id, 'belge kimliği');
  return `${globalCollectionPath(uid, collection)}/${id}`;
}

export function marketRatesPath(uid: string) {
  return `${userPath(uid)}/marketRates/current`;
}
