import { useMemo, useState } from 'react';
import { calculateMonthSummary, formatCurrency, getMonthKey, parseLocaleNumber, sanitizeNumericInput } from '../domain/financeEngine';
import { getMonthCalculationDate } from '../domain/month';
import type { Expense } from '../domain/types';
import { useAkceStore } from '../store/AkceStore';
import { Icon } from './Icon';
import { useDialogSheet } from '../hooks/useDialogSheet';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

export function QuickExpenseSheet({ open, onClose, initialCategory = 'Market', initialType = 'zorunlu', initialPaymentMethod = 'kart', onSave }: {
  open: boolean;
  onClose: () => void;
  initialCategory?: string;
  initialType?: Expense['type'];
  initialPaymentMethod?: Expense['paymentMethod'];
  onSave?: (category: string, type: Expense['type'], paymentMethod: Expense['paymentMethod']) => void;
}) {
  const { state, dispatch } = useAkceStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [expenseType, setExpenseType] = useState<Expense['type']>(initialType);
  const [paymentMethod, setPaymentMethod] = useState<Expense['paymentMethod']>(initialPaymentMethod);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const summary = useMemo(() => calculateMonthSummary(state.incomes, state.fixedExpenses, state.investments, state.expenses, state.assets, getMonthCalculationDate(state.selectedMonthKey)), [state]);
  const numericAmount = parseLocaleNumber(amount) ?? 0;
  const nextLimit = summary.daysLeft > 0 ? Math.max(0, summary.remainingBudget - numericAmount) / summary.daysLeft : 0;
  const tefas = state.investments.find(item => item.monthKey === state.selectedMonthKey && item.group === 'TEFAS')?.plannedAmount ?? 0;
  const requiresWarning = numericAmount > summary.dailySafeLimit || expenseType === 'plansız';

  const monthCategories = state.categoryBudgets.filter(item => item.monthKey === state.selectedMonthKey);
  const hasCategories = monthCategories.length > 0;

  const validCategory = hasCategories && !monthCategories.some(c => c.name === category)
    ? monthCategories[0]?.name ?? 'Market'
    : category;

  const sheetRef = useDialogSheet(open, onClose);
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.94)}px` : '94vh';

  const save = () => {
    if (numericAmount <= 0) { setFormError('Tutar 0\'dan büyük olmalı.'); return; }
    if (!hasCategories) { setFormError('Henüz kategori yok. Bütçeden kategori ekleyin.'); return; }
    const now = new Date();
    const date = state.selectedMonthKey === getMonthKey(now) ? now.toISOString().slice(0, 10) : `${state.selectedMonthKey}-01`;
    dispatch({ type: 'ADD_EXPENSE', payload: { id: crypto.randomUUID(), amount: numericAmount, category: validCategory, type: expenseType, paymentMethod, note: note.trim() || undefined, date, monthKey: state.selectedMonthKey, createdAt: now.getTime(), updatedAt: now.getTime(), userId: 'local-user' } });
    onSave?.(validCategory, expenseType, paymentMethod);
    setAmount(''); setNote(''); setFormError(''); onClose();
  };

  if (!open) return null;

  return <div className="sheet-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="expense-title" ref={sheetRef} style={{ maxHeight: sheetMaxHeight }}>
      <div className="sheet__handle" />
      <header className="sheet__header"><div><span className="eyebrow">YAŞAM KASASI</span><h2 id="expense-title">Hızlı harcama</h2></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button></header>
      <label className="amount-input"><span>Tutar</span><div><input autoFocus inputMode="decimal" value={amount} onChange={event => { setAmount(sanitizeNumericInput(event.target.value)); setFormError(''); }} placeholder="0" aria-label="Harcama tutarı"/><b>TL</b></div></label>
      <div className="quick-amounts">{[100, 250, 500, 1000].map(value => <button key={value} type="button" onClick={() => setAmount(String((numericAmount || 0) + value))}>+{value}</button>)}</div>
      {hasCategories
        ? <div className="form-grid"><label>Kategori<select aria-label="Kategori" value={validCategory} onChange={e => { setCategory(e.target.value); setFormError(''); }}>{monthCategories.map(item => <option key={item.id}>{item.name}</option>)}</select></label><label>Ödeme<select aria-label="Ödeme" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as Expense['paymentMethod'])}><option value="kart">Kart</option><option value="nakit">Nakit</option></select></label></div>
        : <div className="form-error">Henüz kategori yok. Bütçeden kategori ekleyin.</div>}
      <fieldset className="segmented"><legend>Harcama türü</legend>{(['zorunlu', 'isteğe bağlı', 'plansız'] as const).map(value => <button type="button" key={value} className={expenseType === value ? 'active' : ''} onClick={() => setExpenseType(value)}>{value}</button>)}</fieldset>
      <label className="field">Not <input value={note} onChange={e => setNote(e.target.value)} placeholder="İstersen kısa bir not ekle" /></label>
      {numericAmount > 0 && requiresWarning && <div className="impact"><b>Bu harcamanın etkisi</b><p>Günlük güvenli limitin <strong>{formatCurrency(summary.dailySafeLimit)}</strong> → <strong>{formatCurrency(nextLimit)}</strong> olacak.</p>{tefas > 0 && <small>Bu tutar aylık TEFAS yatırımının %{Math.round(numericAmount / tefas * 100)}'üne eşit.</small>}</div>}
      {formError && <p className="form-error">{formError}</p>}
      <button className="primary-button" disabled={numericAmount <= 0 || !hasCategories} onClick={save}>Harcamayı kaydet</button>
    </section>
  </div>;
}
