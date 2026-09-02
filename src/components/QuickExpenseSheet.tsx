import { useMemo, useState } from 'react';
import { calculateMonthSummary, formatCurrency, getMonthKey } from '../domain/financeEngine';
import type { Expense } from '../domain/types';
import { useAkceStore } from '../store/AkceStore';
import { Icon } from './Icon';

export function QuickExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useAkceStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Market');
  const [expenseType, setExpenseType] = useState<Expense['type']>('zorunlu');
  const [paymentMethod, setPaymentMethod] = useState<Expense['paymentMethod']>('kart');
  const [note, setNote] = useState('');
  const summary = useMemo(() => calculateMonthSummary(state.incomes, state.fixedExpenses, state.investments, state.expenses, state.assets), [state]);
  const numericAmount = Number(amount) || 0;
  const nextLimit = summary.daysLeft > 0 ? Math.max(0, summary.remainingBudget - numericAmount) / summary.daysLeft : 0;
  const tefas = state.investments.find(item => item.group === 'TEFAS')?.plannedAmount ?? 0;
  const requiresWarning = numericAmount > summary.dailySafeLimit || expenseType === 'plansız';

  const save = () => {
    if (numericAmount <= 0) return;
    const now = new Date();
    dispatch({ type: 'ADD_EXPENSE', payload: { id: crypto.randomUUID(), amount: numericAmount, category, type: expenseType, paymentMethod, note: note.trim() || undefined, date: now.toISOString().slice(0, 10), monthKey: getMonthKey(now), createdAt: now.getTime(), updatedAt: now.getTime(), userId: 'local-user' } });
    setAmount(''); setNote(''); setExpenseType('zorunlu'); onClose();
  };

  if (!open) return null;
  return <div className="sheet-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="expense-title">
      <div className="sheet__handle" />
      <header className="sheet__header"><div><span className="eyebrow">YAŞAM KASASI</span><h2 id="expense-title">Hızlı harcama</h2></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button></header>
      <label className="amount-input"><span>Tutar</span><div><input autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" aria-label="Harcama tutarı"/><b>TL</b></div></label>
      <div className="quick-amounts">{[100, 250, 500, 1000].map(value => <button key={value} onClick={() => setAmount(String(numericAmount + value))}>+{value}</button>)}</div>
      <div className="form-grid"><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}>{state.categoryBudgets.map(item => <option key={item.id}>{item.name}</option>)}</select></label><label>Ödeme<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as Expense['paymentMethod'])}><option value="kart">Kart</option><option value="nakit">Nakit</option></select></label></div>
      <fieldset className="segmented"><legend>Harcama türü</legend>{(['zorunlu', 'isteğe bağlı', 'plansız'] as const).map(value => <button type="button" key={value} className={expenseType === value ? 'active' : ''} onClick={() => setExpenseType(value)}>{value}</button>)}</fieldset>
      <label className="field">Not <input value={note} onChange={e => setNote(e.target.value)} placeholder="İstersen kısa bir not ekle" /></label>
      {numericAmount > 0 && requiresWarning && <div className="impact"><b>Bu harcamanın etkisi</b><p>Günlük güvenli limitin <strong>{formatCurrency(summary.dailySafeLimit)}</strong> → <strong>{formatCurrency(nextLimit)}</strong> olacak.</p>{tefas > 0 && <small>Bu tutar aylık TEFAS yatırımının %{Math.round(numericAmount / tefas * 100)}’üne eşit.</small>}</div>}
      <button className="primary-button" disabled={numericAmount <= 0} onClick={save}>Harcamayı kaydet</button>
    </section>
  </div>;
}
