import { useEffect, useMemo, useState } from 'react';
import { coachProvider } from '../domain/coachEngine';
import { calculateMonthSummary, calculateInvestmentRatio, calculateExpenseRatio, formatCurrency, formatPercentage, formatRatio, getAssetProgress, getMonthKey, getTotalAssets, getTotalAssetTargets } from '../domain/financeEngine';
import { formatMonthKey, getMonthCalculationDate, shiftMonthKey } from '../domain/month';
import type { Asset, AssetGroup, AssetUnit, Income, FixedExpense, CategoryBudget, Investment } from '../domain/types';
import { ASSET_GROUPS, ASSET_GROUP_LABELS, ASSET_UNITS, ASSET_UNIT_LABELS } from '../domain/types';
import { useAkceStore } from '../store/AkceStore';
import { useAuth } from '../auth/AuthProvider';
import { getIsDeviceTrusted, setIsDeviceTrusted } from '../store/devicePreference';
import { Icon } from '../components/Icon';
import { Progress } from '../components/Progress';
import { useDialogSheet } from '../hooks/useDialogSheet';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

const CATEGORY_COLORS = ['#538b67', '#bd8b2e', '#9a6548', '#707771', '#a74737', '#4a6fa5'];
const titleCase = (value: string) => value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1);
const getFirstName = (displayName: string | null | undefined): string | null => {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0];
  return first || null;
};

type IncomeFormMode = 'add' | 'edit';
type FixedExpenseFormMode = 'add' | 'edit';

interface IncomeFormState {
  isOpen: boolean;
  mode: IncomeFormMode;
  currentIncome?: Income;
}

interface FixedExpenseFormState {
  isOpen: boolean;
  mode: FixedExpenseFormMode;
  currentFixedExpense?: FixedExpense;
}

export function useSummary() {
  const { state } = useAkceStore();
  return useMemo(() => calculateMonthSummary(state.incomes, state.fixedExpenses, state.investments, state.expenses, state.assets, getMonthCalculationDate(state.selectedMonthKey)), [state]);
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></header>;
}

function MonthNavigation() {
  const { state, dispatch } = useAkceStore();
  const currentMonthKey = getMonthKey();
  const sourceMonthKey = shiftMonthKey(state.selectedMonthKey, -1);
  const hasMonthData = state.incomes.some(item => item.monthKey === state.selectedMonthKey)
    || state.fixedExpenses.some(item => item.monthKey === state.selectedMonthKey)
    || state.investments.some(item => item.monthKey === state.selectedMonthKey)
    || state.categoryBudgets.some(item => item.monthKey === state.selectedMonthKey);
  return <div className="month-navigation">
    <button onClick={() => dispatch({ type: 'SET_SELECTED_MONTH', monthKey: sourceMonthKey })} aria-label="Önceki ay">‹</button>
    <div><b>{formatMonthKey(state.selectedMonthKey)}</b><small>{state.selectedMonthKey === currentMonthKey ? 'Bu ay' : 'Geçmiş ay'}</small></div>
    <button disabled={state.selectedMonthKey >= currentMonthKey} onClick={() => dispatch({ type: 'SET_SELECTED_MONTH', monthKey: shiftMonthKey(state.selectedMonthKey, 1) })} aria-label="Sonraki ay">›</button>
    {!hasMonthData && <button className="month-navigation__initialize" onClick={() => dispatch({ type: 'INITIALIZE_MONTH', sourceMonthKey, targetMonthKey: state.selectedMonthKey })}>Önceki ayın planıyla hazırla</button>}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function HomeScreen({ goTo }: { goTo: (page: string) => void }) {
  const { state } = useAkceStore();
  const { user } = useAuth();
  const summary = useSummary();
  const advice = coachProvider.getAdvice(summary)[0];
  const totalAssets = getTotalAssets(state.assets);
  const assetTargets = getTotalAssetTargets(state.assets);
  const firstName = getFirstName(user?.displayName);
  const isCurrentMonth = state.selectedMonthKey === getMonthKey();
  const actualInvestments = state.investments.filter(item => item.monthKey === state.selectedMonthKey).reduce((sum, item) => sum + item.actualAmount, 0);
  const investmentRatio = calculateInvestmentRatio(summary.totalIncome, actualInvestments);
  const expenseRatio = calculateExpenseRatio(summary.totalIncome, summary.totalAutomaticExpenses, summary.totalVariableExpenses);
  return <div className="screen home-screen">
    <header className="home-welcome"><div><span className="eyebrow">{formatMonthKey(state.selectedMonthKey).toLocaleUpperCase('tr-TR')}</span><h1>Merhaba{firstName ? `, ${firstName}` : ''}.</h1></div><button className="avatar" aria-label="Profil">MB</button></header>
    <MonthNavigation />
    <section className="hero-balance">
      <span className="hero-balance__label">{isCurrentMonth ? 'BUGÜN GÜVENLE HARCAYABİLECEĞİN' : 'AY SONUNDA KALAN SERBEST BÜTÇE'}</span>
      {summary.dailySafeLimit > 0
        ? <strong>{formatCurrency(summary.dailySafeLimit)}</strong>
        : <><strong>{formatCurrency(0)}</strong><small style={{ display: 'block', color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>Bütçe aşıldı</small></>}
      <div className="hero-balance__meta"><span>Kalan serbest bütçe <b>{formatCurrency(summary.remainingBudget)}</b></span><i /><span>Kalan gün <b>{summary.daysLeft}</b></span></div>
    </section>
    <section className="income-ratios">
      <span className="eyebrow">GELİR DAĞILIMI</span>
      <div className="income-ratios__grid">
        <div className="income-ratio-card"><span>Yatırım Oranı</span><strong>{formatRatio(investmentRatio)}</strong><small>Gelirinin yatırıma giden kısmı</small></div>
        <div className="income-ratio-card"><span>Harcama Oranı</span><strong>{formatRatio(expenseRatio)}</strong><small>Gelirinin harcamalara giden kısmı</small></div>
      </div>
    </section>
    <section className="tempo">
      <div className="tempo__labels"><span>Ayın <b>%{Math.round(summary.monthProgress)}’i</b> geçti</span><span>Bütçe kullanım oranı <b>%{Math.round(summary.budgetConsumptionRate)}</b></span></div>
      <div className="tempo__track"><span style={{ width: `${Math.min(100, summary.monthProgress)}%` }} /><b style={{ left: `${Math.min(100, summary.budgetConsumptionRate)}%` }} /></div>
      <p>{summary.budgetConsumptionRate <= summary.monthProgress ? 'Harika, bütçen zamanın gerisinden geliyor.' : 'Bütçe tempon zamanın önünde; bugün daha sakin ilerle.'}</p>
    </section>
    <button className={`coach-card coach-card--${advice.tone}`} onClick={() => goTo('coach')}><span className="coach-card__icon"><Icon name="spark" /></span><span><small>FİNANS KOÇU</small><b>{advice.title}</b><p>{advice.message}</p></span><Icon name="arrow" className="coach-card__arrow" /></button>
    <div className="home-lower">
      <section className="plain-section"><div className="section-heading"><div><span className="eyebrow">YAŞAM KASASI</span><h2>Son harcamalar</h2></div><button className="text-button" onClick={() => goTo('expenses')}>Tümünü gör <Icon name="arrow" /></button></div><div className="transaction-list">{state.expenses.filter(item => item.monthKey === state.selectedMonthKey).slice(0, 3).map(item => <div className="transaction" key={item.id}><span className="transaction__icon"><Icon name={item.paymentMethod === 'kart' ? 'card' : 'receipt'} /></span><span><b>{item.note || item.category}</b><small>{item.category} · {titleCase(item.type)}</small></span><strong>-{formatCurrency(item.amount)}</strong></div>)}</div></section>
      <aside className="freedom-summary"><span className="eyebrow">ÖZGÜRLÜK KASASI</span><h2>{formatCurrency(totalAssets)}</h2><p>Toplam finansal varlık</p><Progress value={totalAssets / assetTargets * 100} tone="gold" /><div><span>Genel hedef</span><b>{formatCurrency(assetTargets)}</b></div><button onClick={() => goTo('assets')}>Varlıkları incele <Icon name="arrow" /></button></aside>
    </div>
    <section className="investment-strip"><div><span className="eyebrow">BU AY YATIRIM</span><strong>{formatCurrency(actualInvestments)}</strong><small>{formatCurrency(summary.totalFixedInvestment)} planlandı</small></div><Progress value={summary.investmentPlanRealizationRate} tone="gold"/><b>%{Math.round(summary.investmentPlanRealizationRate)}</b></section>
  </div>;
}

export function ExpensesScreen({ openQuick, openFormSignal: _openFormSignal, onFormSignalConsumed: _onFormSignalConsumed }: { openQuick: () => void; openFormSignal?: string | null; onFormSignalConsumed?: () => void }) {
  const { state, dispatch } = useAkceStore();
  const summary = useSummary();
  const [filter, setFilter] = useState('Tümü');
  const monthExpenses = state.expenses.filter(item => item.monthKey === state.selectedMonthKey);
  const visible = filter === 'Tümü' ? monthExpenses : monthExpenses.filter(item => titleCase(item.type) === filter);
  return <div className="screen"><PageHeader eyebrow="YAŞAM KASASI" title="Harcamalar" description="Her çıkışı gör, davranışını fark et." />
    <MonthNavigation />
    <div className="metric-row"><Metric label="Bu ay harcanan" value={formatCurrency(summary.totalVariableExpenses)} /><Metric label="Plansız oran" value={formatPercentage(summary.unplannedRatio)} detail="Hedef: %20 altı" /><button className="add-inline" onClick={openQuick}><Icon name="plus" /> Yeni harcama</button></div>
    <div className="filter-row">{['Tümü', 'Zorunlu', 'İsteğe bağlı', 'Plansız'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <section className="data-card"><div className="data-card__header"><b>İşlemler</b><span>{visible.length} kayıt</span></div>{visible.map(item => <div className="data-row" key={item.id}><span className="transaction__icon"><Icon name={item.paymentMethod === 'kart' ? 'card' : 'receipt'} /></span><span className="data-row__main"><b>{item.note || item.category}</b><small>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(item.date))} · {item.paymentMethod}</small></span><span className={`tag tag--${item.type === 'plansız' ? 'warn' : 'neutral'}`}>{titleCase(item.type)}</span><strong>-{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => dispatch({ type: 'REMOVE_EXPENSE', id: item.id })} aria-label="Harcamayı sil"><Icon name="trash" /></button></div>)}</section>
  </div>;
}

type BudgetTab = 'Genel Bakış' | 'Gelirler' | 'Otomatik Giderler' | 'Kategoriler';
export function BudgetScreen({ initialTab = 'Genel Bakış', openFormSignal, onFormSignalConsumed }: { initialTab?: BudgetTab; openFormSignal?: string | null; onFormSignalConsumed?: () => void }) {
  const { state, dispatch } = useAkceStore(); const summary = useSummary(); const [tab, setTab] = useState<BudgetTab>(initialTab);
  const tabs: BudgetTab[] = ['Genel Bakış', 'Gelirler', 'Otomatik Giderler', 'Kategoriler'];
  const monthIncomes = state.incomes.filter(item => item.monthKey === state.selectedMonthKey);
  const monthFixedExpenses = state.fixedExpenses.filter(item => item.monthKey === state.selectedMonthKey);
  const monthCategoryBudgets = state.categoryBudgets.filter(item => item.monthKey === state.selectedMonthKey);

  const [incomeForm, setIncomeForm] = useState<IncomeFormState>({ isOpen: false, mode: 'add' });
  const [incomeName, setIncomeName] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeRecurring, setIncomeRecurring] = useState(true);
  const [fixedForm, setFixedForm] = useState<FixedExpenseFormState>({ isOpen: false, mode: 'add' });
  const [fixedName, setFixedName] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [fixedDueDay, setFixedDueDay] = useState('1');
  const [fixedCategory, setFixedCategory] = useState('Fatura');
  const [fixedFrequency, setFixedFrequency] = useState<'monthly' | 'yearly'>('monthly');

  const [categoryForm, setCategoryForm] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; currentCategory?: CategoryBudget }>({ isOpen: false, mode: 'add' });
  const [categoryName, setCategoryName] = useState('');
  const [categoryLimit, setCategoryLimit] = useState('');
  const [categoryColor, setCategoryColor] = useState('');

  const [incomeError, setIncomeError] = useState('');
  const [fixedError, setFixedError] = useState('');
  const [categoryError, setCategoryError] = useState('');

  const closeIncomeForm = () => { setIncomeForm({ isOpen: false, mode: 'add' }); setIncomeError(''); };
  const closeFixedForm = () => { setFixedForm({ isOpen: false, mode: 'add' }); setFixedError(''); };
  const closeCategoryForm = () => { setCategoryForm({ isOpen: false, mode: 'add' }); setCategoryError(''); };

  const incomeSheetRef = useDialogSheet(incomeForm.isOpen, closeIncomeForm);
  const fixedSheetRef = useDialogSheet(fixedForm.isOpen, closeFixedForm);
  const categorySheetRef = useDialogSheet(categoryForm.isOpen, closeCategoryForm);
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.94)}px` : '94vh';

  const openAddIncome = () => {
    setIncomeName(''); setIncomeAmount(''); setIncomeRecurring(true); setIncomeError('');
    setIncomeForm({ isOpen: true, mode: 'add' });
  };

  useEffect(() => {
    if (openFormSignal === 'income') {
      openAddIncome();
      onFormSignalConsumed?.();
    }
  }, [openFormSignal]);

  const openEditIncome = (income: Income) => {
    setIncomeName(income.name);
    setIncomeAmount(String(income.amount));
    setIncomeRecurring(income.recurring);
    setIncomeError('');
    setIncomeForm({ isOpen: true, mode: 'edit', currentIncome: income });
  };

  const saveIncome = () => {
    const amount = Number(incomeAmount);
    if (!incomeName.trim()) { setIncomeError('Ad boş olamaz.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setIncomeError('Tutar 0\'dan büyük olmalı.'); return; }
    const now = Date.now();
    if (incomeForm.mode === 'edit' && incomeForm.currentIncome) {
      dispatch({ type: 'UPDATE_INCOME', payload: { ...incomeForm.currentIncome, name: incomeName.trim(), amount, recurring: incomeRecurring, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_INCOME', payload: { id: crypto.randomUUID(), name: incomeName.trim(), amount, date: `${state.selectedMonthKey}-01`, recurring: incomeRecurring, active: true, monthKey: state.selectedMonthKey, createdAt: now, updatedAt: now, userId: 'local-user' } });
    }
    setIncomeForm({ isOpen: false, mode: 'add' }); setIncomeError('');
  };

  const deleteIncome = (id: string) => dispatch({ type: 'DELETE_INCOME', id });

  const uniqueCategories = Array.from(new Set([...monthCategoryBudgets.map(category => category.name), ...monthFixedExpenses.map(expense => expense.category)]));

  const openAddFixed = () => {
    setFixedName(''); setFixedAmount(''); setFixedDueDay('1');
    setFixedCategory(uniqueCategories[0] ?? 'Fatura'); setFixedFrequency('monthly'); setFixedError('');
    setFixedForm({ isOpen: true, mode: 'add' });
  };

  const openEditFixed = (expense: FixedExpense) => {
    setFixedName(expense.name);
    setFixedAmount(String(expense.amount));
    setFixedDueDay(String(expense.dueDay));
    setFixedCategory(expense.category);
    setFixedFrequency(expense.frequency);
    setFixedError('');
    setFixedForm({ isOpen: true, mode: 'edit', currentFixedExpense: expense });
  };

  const saveFixed = () => {
    const amount = Number(fixedAmount);
    const dueDay = Number(fixedDueDay) || 0;
    if (!fixedName.trim()) { setFixedError('Ad boş olamaz.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setFixedError('Tutar 0\'dan büyük olmalı.'); return; }
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) { setFixedError('Ödeme günü 1–31 arasında olmalı.'); return; }
    const clampedDueDay = Math.min(31, Math.max(1, dueDay));
    const now = Date.now();
    if (fixedForm.mode === 'edit' && fixedForm.currentFixedExpense) {
      dispatch({ type: 'UPDATE_FIXED_EXPENSE', payload: { ...fixedForm.currentFixedExpense, name: fixedName.trim(), amount, dueDay: clampedDueDay, category: fixedCategory, frequency: fixedFrequency, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_FIXED_EXPENSE', payload: { id: crypto.randomUUID(), name: fixedName.trim(), amount, dueDay: clampedDueDay, category: fixedCategory, frequency: fixedFrequency, active: true, monthKey: state.selectedMonthKey, createdAt: now, updatedAt: now, userId: 'local-user' } });
    }
    setFixedForm({ isOpen: false, mode: 'add' }); setFixedError('');
  };

  const deleteFixed = (id: string) => dispatch({ type: 'DELETE_FIXED_EXPENSE', id });

  const openAddCategory = () => {
    setCategoryName(''); setCategoryLimit(''); setCategoryColor('#538b67'); setCategoryError('');
    setCategoryForm({ isOpen: true, mode: 'add' });
  };

  const openEditCategory = (category: CategoryBudget) => {
    setCategoryName(category.name);
    setCategoryLimit(String(category.limit));
    setCategoryColor(category.color);
    setCategoryError('');
    setCategoryForm({ isOpen: true, mode: 'edit', currentCategory: category });
  };

  const saveCategory = () => {
    const limit = Number(categoryLimit);
    if (!categoryName.trim()) { setCategoryError('Ad boş olamaz.'); return; }
    if (!Number.isFinite(limit) || limit < 0) { setCategoryError('Limit 0 veya daha büyük olmalı.'); return; }
    const payload: CategoryBudget = {
      id: categoryForm.mode === 'edit' && categoryForm.currentCategory ? categoryForm.currentCategory.id : crypto.randomUUID(),
      name: categoryName.trim(),
      limit,
      color: categoryColor.trim() || '#538b67',
      monthKey: state.selectedMonthKey,
    };
    dispatch({ type: categoryForm.mode === 'edit' ? 'UPDATE_CATEGORY_BUDGET' : 'ADD_CATEGORY_BUDGET', payload });
    setCategoryForm({ isOpen: false, mode: 'add' }); setCategoryError('');
  };

  const deleteCategory = (id: string) => dispatch({ type: 'DELETE_CATEGORY_BUDGET', id });

  return (
  <div className="screen">
    <PageHeader eyebrow="AYLIK PLAN" title="Bütçe" description="Parana ay başında görev ver." />
    <MonthNavigation />
    <nav className="tabs">{tabs.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</nav>
    {tab === 'Genel Bakış' && <><div className="metric-grid"><div className="metric metric--lead"><span>Toplam gelir</span><strong>{formatCurrency(summary.totalIncome)}</strong></div><Metric label="Korumaya alınan yatırım" value={formatCurrency(summary.totalFixedInvestment)} /><Metric label="Otomatik gider" value={formatCurrency(summary.totalAutomaticExpenses)} /><Metric label="Serbest bütçe" value={formatCurrency(summary.remainingBudget)} /></div><section className="budget-flow"><h2>Paranın dağılımı</h2>{[['Yatırım', summary.totalFixedInvestment, 'gold'], ['Otomatik giderler', summary.totalAutomaticExpenses, 'clay'], ['Gerçekleşen harcama', summary.totalVariableExpenses, 'green']].map(([name, value, tone]) => <div className="budget-line" key={String(name)}><div><span>{name}</span><b>{formatCurrency(Number(value))}</b></div><Progress value={Number(value) / summary.totalIncome * 100} tone={tone as 'gold' | 'clay' | 'green'} /></div>)}</section></>}
    {tab === 'Gelirler' && <section className="data-card"><button className="add-inline" onClick={openAddIncome}><Icon name="plus" /> Yeni gelir</button><div className="data-card__header"><b>Gelir kaynakları</b><strong>{formatCurrency(summary.totalIncome)}</strong></div>{monthIncomes.map(item => <div className="data-row" key={item.id}><span className="status-dot status-dot--green"/><span className="data-row__main"><b>{item.name}</b><small>{item.recurring ? 'Her ay' : 'Tek seferlik'}</small></span><strong>{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => openEditIncome(item)} aria-label="Geliri düzenle"><Icon name="edit" /></button><button className="delete-button" onClick={() => deleteIncome(item.id)} aria-label="Geliri sil"><Icon name="trash" /></button></div>)}</section>}
    {tab === 'Otomatik Giderler' && <section className="data-card"><button className="add-inline" onClick={openAddFixed}><Icon name="plus" /> Yeni otomatik gider</button><div className="data-card__header"><b>Otomatik ödemeler</b><span>Aktif giderler bütçeden ayrılır</span></div>{monthFixedExpenses.map(item => <div className={`data-row ${item.active ? '' : 'muted-row'}`} key={item.id}><span className="date-badge">{item.dueDay}<small>GÜN</small></span><span className="data-row__main"><b>{item.name}</b><small>{item.category}</small></span><strong>{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => openEditFixed(item)} aria-label="Gideri düzenle"><Icon name="edit" /></button><button className="delete-button" onClick={() => deleteFixed(item.id)} aria-label="Gideri sil"><Icon name="trash" /></button><button className={`switch ${item.active ? 'active' : ''}`} aria-label={`${item.name} durumunu değiştir`} onClick={() => dispatch({ type: 'TOGGLE_FIXED', id: item.id })}><span /></button></div>)}</section>}
    {tab === 'Kategoriler' && <section className="category-grid"><button className="add-inline" onClick={openAddCategory}><Icon name="plus" /> Yeni kategori</button>{monthCategoryBudgets.map(cat => { const spent = state.expenses.filter(e => e.monthKey === state.selectedMonthKey && e.category === cat.name).reduce((sum, e) => sum + e.amount, 0); const pct = spent / cat.limit * 100; const progressTone = pct > 100 ? 'danger' : pct >= 80 ? 'warn' : 'green'; return (<div key={cat.id} className="category-card-wrapper"><article className="category-card"><div><span className="category-dot" style={{ background: cat.color }}/><b>{cat.name}</b><strong>{Math.round(pct)}%</strong></div><h3>{formatCurrency(cat.limit - spent)}</h3><p>{formatCurrency(spent)} harcandı · {formatCurrency(cat.limit)} limit</p><Progress value={pct} tone={progressTone} /></article><div className="category-actions"><button className="delete-button" onClick={() => openEditCategory(cat)} aria-label="Kategoriyi düzenle"><Icon name="edit" /></button><button className="delete-button" onClick={() => deleteCategory(cat.id)} aria-label="Kategoriyi sil"><Icon name="trash" /></button></div></div>); })}</section>}

    {incomeForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeIncomeForm(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="income-title" ref={incomeSheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">GELİR</span><h2 id="income-title">{incomeForm.mode === 'add' ? 'Yeni gelir' : 'Geliri düzenle'}</h2></div><button className="icon-button" onClick={closeIncomeForm} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={incomeName} onChange={e => { setIncomeName(e.target.value); setIncomeError(''); }} placeholder="Örn: Maaş" /></label>
        <label className="amount-input"><span>Tutar</span><div><input inputMode="decimal" value={incomeAmount} onChange={e => { setIncomeAmount(e.target.value.replace(/[^0-9.]/g, '')); setIncomeError(''); }} placeholder="0" aria-label="Gelir tutarı" /><b>TL</b></div></label>
        <label className="field"><input type="checkbox" checked={incomeRecurring} onChange={e => setIncomeRecurring(e.target.checked)} /> Her ay tekrarlanan gelir</label>
        {incomeError && <p className="form-error">{incomeError}</p>}
        <button className="primary-button" onClick={saveIncome}>{incomeForm.mode === 'add' ? 'Geliri kaydet' : 'Güncelle'}</button>
      </section>
    </div>}

    {fixedForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeFixedForm(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="fixed-title" ref={fixedSheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">OTOMATİK GİDER</span><h2 id="fixed-title">{fixedForm.mode === 'add' ? 'Yeni otomatik gider' : 'Gideri düzenle'}</h2></div><button className="icon-button" onClick={closeFixedForm} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={fixedName} onChange={e => { setFixedName(e.target.value); setFixedError(''); }} placeholder="Örn: Netflix" /></label>
        <label className="amount-input"><span>Tutar</span><div><input inputMode="decimal" value={fixedAmount} onChange={e => { setFixedAmount(e.target.value.replace(/[^0-9.]/g, '')); setFixedError(''); }} placeholder="0" aria-label="Gider tutarı" /><b>TL</b></div></label>
        <div className="form-grid"><label>Gün (1-31) <input inputMode="numeric" value={fixedDueDay} onChange={e => { setFixedDueDay(e.target.value.replace(/[^0-9]/g, '')); setFixedError(''); }} /></label><label>Kategori<select value={fixedCategory} onChange={e => setFixedCategory(e.target.value)}>{uniqueCategories.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <fieldset className="segmented"><legend>Sıklık</legend>{(['monthly', 'yearly'] as const).map(value => <button type="button" key={value} className={fixedFrequency === value ? 'active' : ''} onClick={() => setFixedFrequency(value)}>{value === 'monthly' ? 'Aylık' : 'Yıllık'}</button>)}</fieldset>
        {fixedError && <p className="form-error">{fixedError}</p>}
        <button className="primary-button" onClick={saveFixed}>{fixedForm.mode === 'add' ? 'Gideri kaydet' : 'Güncelle'}</button>
      </section>
</div>}

    {categoryForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeCategoryForm(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="category-title" ref={categorySheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">KATEGORİ BÜTÇESİ</span><h2 id="category-title">{categoryForm.mode === 'add' ? 'Yeni kategori bütçesi' : 'Kategori bütçesini düzenle'}</h2></div><button className="icon-button" onClick={closeCategoryForm} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={categoryName} onChange={e => { setCategoryName(e.target.value); setCategoryError(''); }} placeholder="Örn: Market" /></label>
        <label className="amount-input"><span>Limit</span><div><input inputMode="decimal" value={categoryLimit} onChange={e => { setCategoryLimit(e.target.value.replace(/[^0-9.]/g, '')); setCategoryError(''); }} placeholder="0" aria-label="Kategori limiti" /><b>TL</b></div></label>
        <label className="field">Renk
          <div className="color-swatches">
            {CATEGORY_COLORS.map(hex => <button key={hex} type="button" className={`color-swatch${categoryColor === hex ? ' active' : ''}`} style={{ background: hex }} onClick={() => { setCategoryColor(hex); setCategoryError(''); }} aria-label={hex} />)}
          </div>
        </label>
        {categoryError && <p className="form-error">{categoryError}</p>}
        <button className="primary-button" onClick={saveCategory}>{categoryForm.mode === 'add' ? 'Kategori kaydet' : 'Güncelle'}</button>
      </section>
    </div>}
  </div>
  );
}
const INVESTMENT_GROUPS = ['TEFAS', 'Nasdaq', 'Altın', 'Gümüş', 'BES'] as const;
const INVESTMENT_GROUP_LABELS: Record<string, string> = { TEFAS: 'TEFAS', Nasdaq: 'ABD / Nasdaq', Altın: 'Altın', Gümüş: 'Gümüş', BES: 'Bireysel Emeklilik' };

export function InvestmentsScreen({ openFormSignal, onFormSignalConsumed }: { openFormSignal?: string | null; onFormSignalConsumed?: () => void }) {
  const { state, dispatch } = useAkceStore(); const summary = useSummary();
  const monthInvestments = state.investments.filter(item => item.monthKey === state.selectedMonthKey);

  const [investForm, setInvestForm] = useState<{ isOpen: boolean; mode: 'add' | 'edit' }>({ isOpen: false, mode: 'add' });
  const [investGroup, setInvestGroup] = useState<string>('TEFAS');
  const [investPlanned, setInvestPlanned] = useState('');
  const [investActual, setInvestActual] = useState('');
  const [investError, setInvestError] = useState('');

  const investSheetRef = useDialogSheet(investForm.isOpen, () => setInvestForm({ isOpen: false, mode: 'add' }));
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.94)}px` : '94vh';

  const openAddInvestment = () => {
    setInvestGroup('TEFAS'); setInvestPlanned(''); setInvestActual(''); setInvestError('');
    setInvestForm({ isOpen: true, mode: 'add' });
  };

  const saveInvestment = () => {
    const planned = Number(investPlanned);
    const actual = Number(investActual) || 0;
    if (!Number.isFinite(planned) || planned <= 0) { setInvestError('Planlanan tutar 0\'dan büyük olmalı.'); return; }
    if (!Number.isFinite(actual) || actual < 0) { setInvestError('Gerçekleşen tutar 0 veya daha büyük olmalı.'); return; }
    const now = Date.now();
    dispatch({ type: 'ADD_INVESTMENT', payload: { id: crypto.randomUUID(), group: investGroup as Investment['group'], plannedAmount: planned, actualAmount: actual, completed: false, monthKey: state.selectedMonthKey, createdAt: now, updatedAt: now, userId: 'local-user' } });
    setInvestForm({ isOpen: false, mode: 'add' });
  };

  useEffect(() => {
    if (openFormSignal === 'investment') {
      openAddInvestment();
      onFormSignalConsumed?.();
    }
  }, [openFormSignal]);

  return <div className="screen"><PageHeader eyebrow="GELECEĞE AYRILAN" title="Yatırımlar" description="Bu ay yatırım için ayırdığın tutarları takip et. Birikmiş portföy değerini değil, aylık yatırım katkını takip edersin." /><MonthNavigation /><div className="protect-banner"><Icon name="target"/><div><b>Yatırım bütçen koruma altında</b><p>{formatCurrency(summary.totalFixedInvestment)} harcanabilir bütçeye dahil edilmedi.</p></div><strong>%{Math.round(summary.investmentPlanRealizationRate)}</strong></div><button className="add-inline" onClick={openAddInvestment}><Icon name="plus" /> Yeni yatırım planı</button>{monthInvestments.length === 0 ? <section className="empty-state"><Icon name="chart" /><p><b>Bu ay için henüz yatırım planın yok.</b></p><small>Yatırım, bu ay geleceğin için ayırdığın tutardır.</small><button className="primary-button" onClick={openAddInvestment}>Yatırım planı ekle</button></section> : <section className="investment-grid">{monthInvestments.map(item => <article className={`investment-card ${item.completed ? 'completed' : ''}`} key={item.id}><span className="asset-monogram">{item.group.slice(0, 2).toLocaleUpperCase('tr-TR')}</span><div className="investment-card__details"><div><span>{item.group}</span><h3>{formatCurrency(item.plannedAmount)}</h3><small>Aylık plan</small></div>{item.actualAmount > 0 && <span className="investment-card__actual">Gerçekleşen: <b>{formatCurrency(item.actualAmount)}</b></span>}</div><button onClick={() => dispatch({ type: 'TOGGLE_INVESTMENT', id: item.id })}><span>{item.completed && <Icon name="check"/>}</span>{item.completed ? 'Tamamlandı' : 'Tamamla'}</button></article>)}</section>}

    {investForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setInvestForm({ isOpen: false, mode: 'add' }); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="invest-title" ref={investSheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">YATIRIM</span><h2 id="invest-title">Yeni yatırım planı</h2></div><button className="icon-button" onClick={() => setInvestForm({ isOpen: false, mode: 'add' })} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Tür<select value={investGroup} onChange={e => setInvestGroup(e.target.value)}>{INVESTMENT_GROUPS.map(g => <option key={g} value={g}>{INVESTMENT_GROUP_LABELS[g]}</option>)}</select></label>
        <label className="amount-input"><span>Planlanan tutar</span><div><input autoFocus inputMode="decimal" value={investPlanned} onChange={e => { setInvestPlanned(e.target.value.replace(/[^0-9.]/g, '')); setInvestError(''); }} placeholder="0" aria-label="Planlanan tutar" /><b>TL</b></div></label>
        <label className="amount-input"><span>Gerçekleşen tutar</span><div><input inputMode="decimal" value={investActual} onChange={e => { setInvestActual(e.target.value.replace(/[^0-9.]/g, '')); setInvestError(''); }} placeholder="0" aria-label="Gerçekleşen tutar" /><b>TL</b></div></label>
        {investError && <p className="form-error">{investError}</p>}
        <button className="primary-button" onClick={saveInvestment}>Yatırımı kaydet</button>
      </section>
    </div>}
  </div>;
}

type AssetFormMode = 'add' | 'edit';
interface AssetFormState {
  isOpen: boolean;
  mode: AssetFormMode;
  currentAsset?: Asset;
}

export function AssetsScreen({ openFormSignal, onFormSignalConsumed }: { openFormSignal?: string | null; onFormSignalConsumed?: () => void }) {
  const { state, dispatch } = useAkceStore();
  const total = getTotalAssets(state.assets);
  const target = getTotalAssetTargets(state.assets);
  const goal = state.goals[0];

  const [assetForm, setAssetForm] = useState<AssetFormState>({ isOpen: false, mode: 'add' });
  const [assetGroup, setAssetGroup] = useState<AssetGroup>('Altın');
  const [assetName, setAssetName] = useState('');
  const [valuationMode, setValuationMode] = useState<'quantity' | 'direct'>('direct');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<AssetUnit>('Adet');
  const [unitPrice, setUnitPrice] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [formError, setFormError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; asset?: Asset }>({ isOpen: false });

  const closeAssetForm = () => { setAssetForm({ isOpen: false, mode: 'add' }); setFormError(''); };
  const closeDeleteConfirm = () => setDeleteConfirm({ isOpen: false });

  const assetSheetRef = useDialogSheet(assetForm.isOpen, closeAssetForm);
  const deleteSheetRef = useDialogSheet(deleteConfirm.isOpen, closeDeleteConfirm);
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.94)}px` : '94vh';

  const derivedCurrentAmount = valuationMode === 'quantity' ? (Number(quantity) || 0) * (Number(unitPrice) || 0) : Number(currentAmount) || 0;

  const openAddAsset = () => {
    setAssetGroup('Altın'); setAssetName(''); setValuationMode('direct');
    setQuantity(''); setUnit('Adet'); setUnitPrice(''); setCurrentAmount(''); setTargetAmount(''); setFormError('');
    setAssetForm({ isOpen: true, mode: 'add' });
  };

  useEffect(() => {
    if (openFormSignal === 'asset') {
      openAddAsset();
      onFormSignalConsumed?.();
    }
  }, [openFormSignal]);

  const openEditAsset = (asset: Asset) => {
    setAssetGroup(asset.group);
    setAssetName(asset.name);
    setValuationMode(asset.valuationMode);
    setQuantity(asset.quantity !== undefined ? String(asset.quantity) : '');
    setUnit(asset.unit ?? 'Adet');
    setUnitPrice(asset.unitPrice !== undefined ? String(asset.unitPrice) : '');
    setCurrentAmount(String(asset.currentAmount));
    setTargetAmount(String(asset.targetAmount));
    setFormError('');
    setAssetForm({ isOpen: true, mode: 'edit', currentAsset: asset });
  };

  const saveAsset = () => {
    const tgt = Number(targetAmount);
    if (!assetName.trim()) { setFormError('Ad boş olamaz.'); return; }
    if (!Number.isFinite(tgt) || tgt < 0) { setFormError('Hedef tutar 0 veya daha büyük olmalı.'); return; }
    let cur: number;
    if (valuationMode === 'quantity') {
      const qty = Number(quantity);
      const price = Number(unitPrice);
      if (!Number.isFinite(qty) || qty <= 0) { setFormError('Miktar 0\'dan büyük olmalı.'); return; }
      if (!Number.isFinite(price) || price < 0) { setFormError('Birim fiyat 0 veya daha büyük olmalı.'); return; }
      cur = qty * price;
    } else {
      cur = Number(currentAmount);
      if (!Number.isFinite(cur) || cur < 0) { setFormError('Güncel değer 0 veya daha büyük olmalı.'); return; }
    }
    const now = Date.now();
    const assetPayload = { group: assetGroup, name: assetName.trim(), valuationMode, quantity: valuationMode === 'quantity' ? Number(quantity) : undefined, unit: valuationMode === 'quantity' ? unit : undefined, unitPrice: valuationMode === 'quantity' ? Number(unitPrice) : undefined, currentAmount: cur, targetAmount: tgt };
    if (assetForm.mode === 'edit' && assetForm.currentAsset) {
      dispatch({ type: 'UPDATE_ASSET', id: assetForm.currentAsset.id, amount: cur, targetAmount: tgt, name: assetPayload.name, group: assetPayload.group, valuationMode: assetPayload.valuationMode, quantity: assetPayload.quantity, unit: assetPayload.unit, unitPrice: assetPayload.unitPrice });
    } else {
      dispatch({ type: 'ADD_ASSET', payload: { id: crypto.randomUUID(), ...assetPayload, createdAt: now, updatedAt: now, userId: 'local-user' } });
    }
    closeAssetForm();
  };

  const openDeleteConfirm = (asset: Asset) => setDeleteConfirm({ isOpen: true, asset });

  const confirmDelete = () => {
    if (deleteConfirm.asset) {
      dispatch({ type: 'DELETE_ASSET', id: deleteConfirm.asset.id });
    }
    closeDeleteConfirm();
  };

  const progressPct = target > 0 ? (total / target) * 100 : 0;

  return <div className="screen">
    <PageHeader eyebrow="ÖZGÜRLÜK KASASI" title="Varlıklar & Hedefler" description="Birikmiş finansal varlıklarının güncel değerini takip et. Yatırım ekranı aylık katkını, Varlıklar ekranı toplam birikmiş değerini gösterir." />

    <section className="assets-hero">
      <span>TOPLAM FİNANSAL VARLIK</span>
      <strong>{formatCurrency(total)}</strong>
      {goal ? <p>Genel hedef: {formatCurrency(goal.targetAmount)}</p> : <p>Henüz hedef belirlenmedi</p>}
      {goal && <><Progress value={progressPct} tone="gold" /><small>%{Math.round(progressPct)} tamamlandı · {formatCurrency(Math.max(0, goal.targetAmount - total))} kaldı</small></>}
    </section>

    <button className="add-inline" onClick={openAddAsset}><Icon name="plus" /> Varlık ekle</button>

    {state.assets.length === 0
      ? <section className="empty-state"><Icon name="target" /><p><b>Henüz varlık eklemedin.</b></p><small>İlk varlığını ekleyerek finansal özgürlük takibini başlat.</small></section>
      : <section className="asset-grid">{state.assets.map(asset => {
          const progress = getAssetProgress(asset);
          return <article className="asset-card" key={asset.id}>
            <header>
              <span className="asset-monogram">{asset.group.slice(0, 2).toLocaleUpperCase('tr-TR')}</span>
              <div><b>{asset.name || ASSET_GROUP_LABELS[asset.group]}</b><small>{ASSET_GROUP_LABELS[asset.group]}{asset.valuationMode === 'quantity' && asset.quantity && asset.unit && asset.unitPrice ? '' : ''}</small></div>
            </header>
            {asset.valuationMode === 'quantity' && asset.quantity && asset.unit && asset.unitPrice
              ? <><p className="asset-card__detail">{asset.quantity} {ASSET_UNIT_LABELS[asset.unit]} × {formatCurrency(asset.unitPrice)}</p><h3>{formatCurrency(asset.currentAmount)}</h3></>
              : <h3>{formatCurrency(asset.currentAmount)}</h3>}
            {asset.targetAmount > 0 && <p>{formatCurrency(asset.targetAmount)} hedef</p>}
            {asset.targetAmount > 0 && <><Progress value={progress} tone="gold" /><div><span>Hedefe kalan</span><b>{formatCurrency(Math.max(0, asset.targetAmount - asset.currentAmount))}</b></div></>}
            <div className="asset-card__actions">
              <button className="delete-button" onClick={() => openEditAsset(asset)} aria-label="Varlığı düzenle"><Icon name="edit" /></button>
              <button className="delete-button" onClick={() => openDeleteConfirm(asset)} aria-label="Varlığı sil"><Icon name="trash" /></button>
            </div>
          </article>;
        })}</section>}

    {assetForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeAssetForm(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="asset-form-title" ref={assetSheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">VARLIK</span><h2 id="asset-form-title">{assetForm.mode === 'add' ? 'Yeni varlık' : 'Varlığı düzenle'}</h2></div><button className="icon-button" onClick={closeAssetForm} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Tür<select value={assetGroup} onChange={e => setAssetGroup(e.target.value as AssetGroup)}>{ASSET_GROUPS.map(g => <option key={g} value={g}>{ASSET_GROUP_LABELS[g]}</option>)}</select></label>
        <label className="field">Ad<input value={assetName} onChange={e => { setAssetName(e.target.value); setFormError(''); }} placeholder="Örn: Gram Altın" /></label>
        <fieldset className="segmented"><legend>Değerleme yöntemi</legend>{(['direct', 'quantity'] as const).map(value => <button type="button" key={value} className={valuationMode === value ? 'active' : ''} onClick={() => { setValuationMode(value); setFormError(''); }}>{value === 'direct' ? 'Doğrudan' : 'Miktar × Fiyat'}</button>)}</fieldset>
        {valuationMode === 'quantity' && <>
          <div className="form-grid">
            <label className="field">Miktar<input inputMode="decimal" value={quantity} onChange={e => { setQuantity(e.target.value.replace(/[^0-9.]/g, '')); setFormError(''); }} placeholder="0" /></label>
            <label className="field">Birim<select value={unit} onChange={e => setUnit(e.target.value as AssetUnit)}>{ASSET_UNITS.map(u => <option key={u} value={u}>{ASSET_UNIT_LABELS[u]}</option>)}</select></label>
          </div>
          <label className="amount-input"><span>Birim fiyat</span><div><input inputMode="decimal" value={unitPrice} onChange={e => { setUnitPrice(e.target.value.replace(/[^0-9.]/g, '')); setFormError(''); }} placeholder="0" aria-label="Birim fiyat" /><b>TL</b></div></label>
          <label className="amount-input"><span>Güncel değer</span><div><input value={formatCurrency(derivedCurrentAmount)} readOnly aria-label="Güncel değer" /><b>TL</b></div></label>
        </>}
        {valuationMode === 'direct' && <label className="amount-input"><span>Güncel değer</span><div><input autoFocus inputMode="decimal" value={currentAmount} onChange={e => { setCurrentAmount(e.target.value.replace(/[^0-9.]/g, '')); setFormError(''); }} placeholder="0" aria-label="Güncel değer" /><b>TL</b></div></label>}
        <label className="amount-input"><span>Hedef değer (isteğe bağlı)</span><div><input inputMode="decimal" value={targetAmount} onChange={e => { setTargetAmount(e.target.value.replace(/[^0-9.]/g, '')); setFormError(''); }} placeholder="0" aria-label="Hedef değer" /><b>TL</b></div></label>
        {formError && <p className="form-error">{formError}</p>}
        <button className="primary-button" onClick={saveAsset}>{assetForm.mode === 'add' ? 'Varlığı kaydet' : 'Güncelle'}</button>
      </section>
    </div>}

    {deleteConfirm.isOpen && deleteConfirm.asset && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeDeleteConfirm(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" ref={deleteSheetRef} style={{ maxHeight: sheetMaxHeight }}>
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">VARLIK SİL</span><h2 id="delete-confirm-title">Varlığı sil</h2></div><button className="icon-button" onClick={closeDeleteConfirm} aria-label="Kapat"><Icon name="close" /></button></header>
        <p className="delete-confirm-text"><b>{deleteConfirm.asset.name || ASSET_GROUP_LABELS[deleteConfirm.asset.group]}</b> varlığını silmek istediğine emin misin? Bu işlem geri alınamaz.</p>
        <div className="delete-confirm-actions">
          <button className="secondary-button" onClick={closeDeleteConfirm}>İptal</button>
          <button className="primary-button primary-button--danger" onClick={confirmDelete}>Evet, sil</button>
        </div>
      </section>
    </div>}
  </div>;
}

export function CoachScreen() {
  const summary = useSummary(); const advice = coachProvider.getAdvice(summary);
  return <div className="screen"><PageHeader eyebrow="DİSİPLİN SİNYALLERİ" title="Finans Koçu" description="Hesapların finans motorundan, yorumların kurallardan gelir." /><MonthNavigation /><section className="coach-lead"><Icon name="spark"/><div><span>BUGÜNÜN ODAĞI</span><h2>{advice[0].title}</h2><p>{advice[0].message}</p></div></section><div className="coach-metrics"><Metric label="Günlük güvenli limit" value={formatCurrency(summary.dailySafeLimit)} /><Metric label="3 günlük ortalama" value={formatCurrency(summary.threeDayAverage)} /><Metric label="7 günlük ortalama" value={formatCurrency(summary.sevenDayAverage)} /><Metric label="Tahmini ay sonu gideri (son 7g ort.)" value={formatCurrency(summary.monthEndEstimate)} /></div><section className="signals"><h2>Sinyaller</h2>{advice.slice(1).map(item => <article key={item.title} className={`signal signal--${item.tone}`}><span><Icon name={item.tone === 'success' ? 'check' : 'spark'} /></span><div><b>{item.title}</b><p>{item.message}</p></div></article>)}</section></div>;
}

export function SettingsScreen({ account, mode }: { account?: { label: string; detail: string; actionLabel: string; onAction: () => void }; mode?: 'local' | 'firebase' }) {
  const { state, dispatch, resetFinanceData } = useAkceStore();
  const [isTrusted, setIsTrustedState] = useState(() => getIsDeviceTrusted());
  const [resetSheetOpen, setResetSheetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const toggleTrusted = () => {
    const next = !isTrusted;
    setIsDeviceTrusted(next);
    setIsTrustedState(next);
  };

  const openResetSheet = () => { setResetSheetOpen(true); setConfirmText(''); setResetStatus('idle'); };
  const closeResetSheet = () => { setResetSheetOpen(false); setConfirmText(''); setResetStatus('idle'); };
  const resetSheetRef = useDialogSheet(resetSheetOpen, closeResetSheet);
  const viewportHeight = useVisualViewportHeight();
  const sheetMaxHeight = viewportHeight > 0 ? `${Math.floor(viewportHeight * 0.94)}px` : '94vh';

  const handleResetConfirm = async () => {
    if (confirmText !== 'SİL') return;
    setResetStatus('loading');
    try {
      await resetFinanceData();
      setResetStatus('done');
      setTimeout(closeResetSheet, 1200);
    } catch {
      setResetStatus('error');
    }
  };

  return <div className="screen"><PageHeader eyebrow="TERCİHLER" title="Ayarlar" description="Akçe deneyimini kendine göre düzenle." />{account && <section className="settings-card"><div><span>Oturum</span><span className="settings-account"><b>{account.label}</b><small>{account.detail}</small></span></div><div><span>Hesap seçimi</span><button className="secondary-button" onClick={account.onAction}>{account.actionLabel}</button></div></section>}<section className="settings-card"><div><span>Para birimi</span><b>{state.settings.currency}</b></div><div><span>Bütçe başlangıç günü</span><b>Her ayın {state.settings.monthStartDay}. günü</b></div><div><span>Veri saklama</span><b>{mode === 'firebase' ? 'Bulut + cihaz' : 'Bu cihazda'}</b></div><div><span>Cihaz türü</span><button className="secondary-button" onClick={toggleTrusted}>{isTrusted ? 'Kişisel cihaz (Kalıcı önbellek)' : 'Ortak cihaz (Geçici bellek)'}</button></div></section><section className="settings-card"><div><span>Tanıtımı yeniden göster</span><button className="secondary-button" onClick={() => dispatch({ type: 'SET_ONBOARDING', value: true })}>Göster</button></div></section><section className="settings-card settings-card--danger"><div><span>Verileri Sıfırla</span><button className="secondary-button secondary-button--danger" onClick={openResetSheet}>Tüm finansal verileri sil</button></div></section><p className="settings-note">{mode === 'firebase' ? 'Akçe verilerin bulutta ve bu cihazda saklanır.' : 'Akçe V1 verileri yalnızca bu cihazda saklar.'}</p>{resetSheetOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeResetSheet(); }}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="reset-title" ref={resetSheetRef} style={{ maxHeight: sheetMaxHeight }}><div className="sheet__handle" /><header className="sheet__header"><div><span className="eyebrow">VERİ SIFIRLAMA</span><h2 id="reset-title">Finansal verileri sil</h2></div><button className="icon-button" onClick={closeResetSheet} aria-label="Kapat"><Icon name="close" /></button></header>{resetStatus === 'done' ? <div className="reset-done"><Icon name="check" /><p>Veriler başarıyla silindi.</p></div> : <><div className="reset-warning"><p><strong>Bu işlem geri alınamaz.</strong></p><ul><li>Harcamalar, gelirler, sabit giderler, yatırımlar, bütçeler, varlıklar ve hedefler silinecek.</li><li>Google hesabı ve AKÇE hesabı silinmeyecek.</li></ul></div><label className="reset-confirm-label"><span>Silme işlemini onaylamak için <strong>SİL</strong> yazın</span><input autoFocus value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="SİL" aria-label="Silme onayı" /></label>{resetStatus === 'error' && <p className="form-error">Silme işlemi başarısız oldu. Lütfen tekrar deneyin.</p>}<button className="primary-button primary-button--danger" disabled={confirmText !== 'SİL' || resetStatus === 'loading'} onClick={handleResetConfirm}>{resetStatus === 'loading' ? 'Siliniyor...' : 'Tüm verileri sil'}</button></>}</section></div>}</div>;
}
