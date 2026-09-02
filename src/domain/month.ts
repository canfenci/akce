import { getMonthKey } from './financeEngine';

const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && monthKeyPattern.test(value);
}

export function monthKeyToDate(monthKey: string, day = 1): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const date = monthKeyToDate(monthKey);
  date.setMonth(date.getMonth() + offset);
  return getMonthKey(date);
}

export function formatMonthKey(monthKey: string): string {
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(monthKeyToDate(monthKey));
}

export function getMonthCalculationDate(monthKey: string, today: Date = new Date()): Date {
  const currentMonthKey = getMonthKey(today);
  if (monthKey === currentMonthKey) return today;
  const [year, month] = monthKey.split('-').map(Number);
  if (monthKey < currentMonthKey) return new Date(year, month, 0, 23, 59, 59, 999);
  return new Date(year, month - 1, 1, 12);
}
