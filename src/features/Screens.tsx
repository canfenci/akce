import { useMemo, useState } from 'react';
import { coachProvider } from '../domain/coachEngine';
import { calculateMonthSummary, formatCurrency, formatPercentage, getAssetProgress, getMonthKey, getTotalAssets, getTotalAssetTargets } from '../domain/financeEngine';
import type { Income, FixedExpense, CategoryBudget } from '../domain/types';
import { useAkceStore } from '../store/AkceStore';
import { Icon } from '../components/Icon';
import { Progress } from '../components/Progress';

const monthLabel = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date());
const titleCase = (value: string) => value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1);

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
  return useMemo(() => calculateMonthSummary(state.incomes, state.fixedExpenses, state.investments, state.expenses, state.assets), [state]);
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><span className="month-pill"><Icon name="calendar" />{monthLabel}</span></header>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function HomeScreen({ goTo }: { goTo: (page: string) => void }) {
  const { state } = useAkceStore();
  const summary = useSummary();
  const advice = coachProvider.getAdvice(summary)[0];
  const totalAssets = getTotalAssets(state.assets);
  const assetTargets = getTotalAssetTargets(state.assets);
  const actualInvestments = state.investments.reduce((sum, item) => sum + item.actualAmount, 0);
  return <div className="screen home-screen">
    <header className="home-welcome"><div><span className="eyebrow">{monthLabel.toLocaleUpperCase('tr-TR')}</span><h1>Merhaba, Murat.</h1></div><button className="avatar" aria-label="Profil">MB</button></header>
    <section className="hero-balance">
      <span className="hero-balance__label">BUGÜN GÜVENLE HARCAYABİLECEĞİN</span>
      <strong>{formatCurrency(summary.dailySafeLimit)}</strong>
      <div className="hero-balance__meta"><span>Kalan serbest bütçe <b>{formatCurrency(summary.remainingBudget)}</b></span><i /><span>Kalan gün <b>{summary.daysLeft}</b></span></div>
    </section>
    <section className="tempo">
      <div className="tempo__labels"><span>Ayın <b>%{Math.round(summary.monthProgress)}’i</b> geçti</span><span>Bütçenin <b>%{Math.round(summary.budgetConsumptionRate)}’i</b> kullanıldı</span></div>
      <div className="tempo__track"><span style={{ width: `${Math.min(100, summary.monthProgress)}%` }} /><b style={{ left: `${Math.min(100, summary.budgetConsumptionRate)}%` }} /></div>
      <p>{summary.budgetConsumptionRate <= summary.monthProgress ? 'Harika, bütçen zamanın gerisinden geliyor.' : 'Bütçe tempon zamanın önünde; bugün daha sakin ilerle.'}</p>
    </section>
    <button className={`coach-card coach-card--${advice.tone}`} onClick={() => goTo('coach')}><span className="coach-card__icon"><Icon name="spark" /></span><span><small>FİNANS KOÇU</small><b>{advice.title}</b><p>{advice.message}</p></span><Icon name="arrow" className="coach-card__arrow" /></button>
    <div className="home-lower">
      <section className="plain-section"><div className="section-heading"><div><span className="eyebrow">YAŞAM KASASI</span><h2>Son harcamalar</h2></div><button className="text-button" onClick={() => goTo('expenses')}>Tümünü gör <Icon name="arrow" /></button></div><div className="transaction-list">{state.expenses.slice(0, 3).map(item => <div className="transaction" key={item.id}><span className="transaction__icon"><Icon name={item.paymentMethod === 'kart' ? 'card' : 'receipt'} /></span><span><b>{item.note || item.category}</b><small>{item.category} · {titleCase(item.type)}</small></span><strong>-{formatCurrency(item.amount)}</strong></div>)}</div></section>
      <aside className="freedom-summary"><span className="eyebrow">ÖZGÜRLÜK KASASI</span><h2>{formatCurrency(totalAssets)}</h2><p>Toplam finansal varlık</p><Progress value={totalAssets / assetTargets * 100} tone="gold" /><div><span>Genel hedef</span><b>{formatCurrency(assetTargets)}</b></div><button onClick={() => goTo('assets')}>Varlıkları incele <Icon name="arrow" /></button></aside>
    </div>
    <section className="investment-strip"><div><span className="eyebrow">BU AY YATIRIM</span><strong>{formatCurrency(actualInvestments)}</strong><small>{formatCurrency(summary.totalFixedInvestment)} planlandı</small></div><Progress value={summary.investmentPlanRealizationRate} tone="gold"/><b>%{Math.round(summary.investmentPlanRealizationRate)}</b></section>
  </div>;
}

export function ExpensesScreen({ openQuick }: { openQuick: () => void }) {
  const { state, dispatch } = useAkceStore();
  const summary = useSummary();
  const [filter, setFilter] = useState('Tümü');
  const visible = filter === 'Tümü' ? state.expenses : state.expenses.filter(item => titleCase(item.type) === filter);
  return <div className="screen"><PageHeader eyebrow="YAŞAM KASASI" title="Harcamalar" description="Her çıkışı gör, davranışını fark et." />
    <div className="metric-row"><Metric label="Bu ay harcanan" value={formatCurrency(summary.totalVariableExpenses)} /><Metric label="Plansız oran" value={formatPercentage(summary.unplannedRatio)} detail="Hedef: %20 altı" /><button className="add-inline" onClick={openQuick}><Icon name="plus" /> Yeni harcama</button></div>
    <div className="filter-row">{['Tümü', 'Zorunlu', 'İsteğe bağlı', 'Plansız'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <section className="data-card"><div className="data-card__header"><b>İşlemler</b><span>{visible.length} kayıt</span></div>{visible.map(item => <div className="data-row" key={item.id}><span className="transaction__icon"><Icon name={item.paymentMethod === 'kart' ? 'card' : 'receipt'} /></span><span className="data-row__main"><b>{item.note || item.category}</b><small>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(item.date))} · {item.paymentMethod}</small></span><span className={`tag tag--${item.type === 'plansız' ? 'warn' : 'neutral'}`}>{titleCase(item.type)}</span><strong>-{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => dispatch({ type: 'REMOVE_EXPENSE', id: item.id })} aria-label="Harcamayı sil"><Icon name="trash" /></button></div>)}</section>
  </div>;
}

type BudgetTab = 'Genel Bakış' | 'Gelirler' | 'Otomatik Giderler' | 'Kategoriler';
export function BudgetScreen({ initialTab = 'Genel Bakış' }: { initialTab?: BudgetTab }) {
  const { state, dispatch } = useAkceStore(); const summary = useSummary(); const [tab, setTab] = useState<BudgetTab>(initialTab);
  const tabs: BudgetTab[] = ['Genel Bakış', 'Gelirler', 'Otomatik Giderler', 'Kategoriler'];

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

  const openAddIncome = () => {
    setIncomeName(''); setIncomeAmount(''); setIncomeRecurring(true);
    setIncomeForm({ isOpen: true, mode: 'add' });
  };

  const openEditIncome = (income: Income) => {
    setIncomeName(income.name);
    setIncomeAmount(String(income.amount));
    setIncomeRecurring(income.recurring);
    setIncomeForm({ isOpen: true, mode: 'edit', currentIncome: income });
  };

  const saveIncome = () => {
    const amount = Number(incomeAmount);
    if (!incomeName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const now = Date.now();
    if (incomeForm.mode === 'edit' && incomeForm.currentIncome) {
      dispatch({ type: 'UPDATE_INCOME', payload: { ...incomeForm.currentIncome, name: incomeName.trim(), amount, recurring: incomeRecurring, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_INCOME', payload: { id: crypto.randomUUID(), name: incomeName.trim(), amount, date: new Date(now).toISOString().slice(0, 10), recurring: incomeRecurring, active: true, monthKey: getMonthKey(), createdAt: now, updatedAt: now, userId: 'local-user' } });
    }
    setIncomeForm({ isOpen: false, mode: 'add' });
  };

  const deleteIncome = (id: string) => dispatch({ type: 'DELETE_INCOME', id });

  const uniqueCategories = Array.from(new Set([...state.categoryBudgets.map(category => category.name), ...state.fixedExpenses.map(expense => expense.category)]));

  const openAddFixed = () => {
    setFixedName(''); setFixedAmount(''); setFixedDueDay('1');
    setFixedCategory(uniqueCategories[0] ?? 'Fatura'); setFixedFrequency('monthly');
    setFixedForm({ isOpen: true, mode: 'add' });
  };

  const openEditFixed = (expense: FixedExpense) => {
    setFixedName(expense.name);
    setFixedAmount(String(expense.amount));
    setFixedDueDay(String(expense.dueDay));
    setFixedCategory(expense.category);
    setFixedFrequency(expense.frequency);
    setFixedForm({ isOpen: true, mode: 'edit', currentFixedExpense: expense });
  };

  const saveFixed = () => {
    const amount = Number(fixedAmount);
    const dueDay = Math.min(31, Math.max(1, Number(fixedDueDay) || 1));
    if (!fixedName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const now = Date.now();
    if (fixedForm.mode === 'edit' && fixedForm.currentFixedExpense) {
      dispatch({ type: 'UPDATE_FIXED_EXPENSE', payload: { ...fixedForm.currentFixedExpense, name: fixedName.trim(), amount, dueDay, category: fixedCategory, frequency: fixedFrequency, updatedAt: now } });
    } else {
      dispatch({ type: 'ADD_FIXED_EXPENSE', payload: { id: crypto.randomUUID(), name: fixedName.trim(), amount, dueDay, category: fixedCategory, frequency: fixedFrequency, active: true, monthKey: getMonthKey(), createdAt: now, updatedAt: now, userId: 'local-user' } });
    }
    setFixedForm({ isOpen: false, mode: 'add' });
  };

  const deleteFixed = (id: string) => dispatch({ type: 'DELETE_FIXED_EXPENSE', id });

  const openAddCategory = () => {
    setCategoryName(''); setCategoryLimit(''); setCategoryColor('#538b67');
    setCategoryForm({ isOpen: true, mode: 'add' });
  };

  const openEditCategory = (category: CategoryBudget) => {
    setCategoryName(category.name);
    setCategoryLimit(String(category.limit));
    setCategoryColor(category.color);
    setCategoryForm({ isOpen: true, mode: 'edit', currentCategory: category });
  };

  const saveCategory = () => {
    const limit = Number(categoryLimit);
    if (!categoryName.trim() || !Number.isFinite(limit) || limit < 0) return;
    const payload: CategoryBudget = {
      id: categoryForm.mode === 'edit' && categoryForm.currentCategory ? categoryForm.currentCategory.id : crypto.randomUUID(),
      name: categoryName.trim(),
      limit,
      color: categoryColor.trim() || '#538b67',
    };
    dispatch({ type: categoryForm.mode === 'edit' ? 'UPDATE_CATEGORY_BUDGET' : 'ADD_CATEGORY_BUDGET', payload });
    setCategoryForm({ isOpen: false, mode: 'add' });
  };

  const deleteCategory = (id: string) => dispatch({ type: 'DELETE_CATEGORY_BUDGET', id });

  return (
  <div className="screen">
    <PageHeader eyebrow="AYLIK PLAN" title="Bütçe" description="Parana ay başında görev ver." />
    <nav className="tabs">{tabs.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</nav>
    {tab === 'Genel Bakış' && <><div className="metric-grid"><Metric label="Toplam gelir" value={formatCurrency(summary.totalIncome)} /><Metric label="Korumaya alınan yatırım" value={formatCurrency(summary.totalFixedInvestment)} /><Metric label="Otomatik gider" value={formatCurrency(summary.totalAutomaticExpenses)} /><Metric label="Serbest bütçe" value={formatCurrency(summary.remainingBudget)} /></div><section className="budget-flow"><h2>Paranın dağılımı</h2>{[['Yatırım', summary.totalFixedInvestment, 'gold'], ['Otomatik giderler', summary.totalAutomaticExpenses, 'clay'], ['Gerçekleşen harcama', summary.totalVariableExpenses, 'green']].map(([name, value, tone]) => <div className="budget-line" key={String(name)}><div><span>{name}</span><b>{formatCurrency(Number(value))}</b></div><Progress value={Number(value) / summary.totalIncome * 100} tone={tone as 'gold' | 'clay' | 'green'} /></div>)}</section></>}
    {tab === 'Gelirler' && <section className="data-card"><button className="add-inline" onClick={openAddIncome}><Icon name="plus" /> Yeni gelir</button><div className="data-card__header"><b>Gelir kaynakları</b><strong>{formatCurrency(summary.totalIncome)}</strong></div>{state.incomes.map(item => <div className="data-row" key={item.id}><span className="status-dot status-dot--green"/><span className="data-row__main"><b>{item.name}</b><small>{item.recurring ? 'Her ay' : 'Tek seferlik'}</small></span><strong>{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => openEditIncome(item)} aria-label="Geliri düzenle"><Icon name="check" /></button><button className="delete-button" onClick={() => deleteIncome(item.id)} aria-label="Geliri sil"><Icon name="trash" /></button></div>)}</section>}
    {tab === 'Otomatik Giderler' && <section className="data-card"><button className="add-inline" onClick={openAddFixed}><Icon name="plus" /> Yeni otomatik gider</button><div className="data-card__header"><b>Otomatik ödemeler</b><span>Aktif giderler bütçeden ayrılır</span></div>{state.fixedExpenses.map(item => <div className={`data-row ${item.active ? '' : 'muted-row'}`} key={item.id}><span className="date-badge">{item.dueDay}<small>GÜN</small></span><span className="data-row__main"><b>{item.name}</b><small>{item.category}</small></span><strong>{formatCurrency(item.amount)}</strong><button className="delete-button" onClick={() => openEditFixed(item)} aria-label="Gideri düzenle"><Icon name="check" /></button><button className="delete-button" onClick={() => deleteFixed(item.id)} aria-label="Gideri sil"><Icon name="trash" /></button><button className={`switch ${item.active ? 'active' : ''}`} aria-label={`${item.name} durumunu değiştir`} onClick={() => dispatch({ type: 'TOGGLE_FIXED', id: item.id })}><span /></button></div>)}</section>}
    {tab === 'Kategoriler' && <section className="category-grid"><button className="add-inline" onClick={openAddCategory}><Icon name="plus" /> Yeni kategori</button>{state.categoryBudgets.map(cat => { const spent = state.expenses.filter(e => e.monthKey === getMonthKey() && e.category === cat.name).reduce((sum, e) => sum + e.amount, 0); return (<div key={cat.id} className="category-card-wrapper"><article className="category-card"><div><span className="category-dot" style={{ background: cat.color }}/><b>{cat.name}</b><strong>{Math.round(spent / cat.limit * 100)}%</strong></div><h3>{formatCurrency(cat.limit - spent)}</h3><p>{formatCurrency(spent)} harcandı · {formatCurrency(cat.limit)} limit</p><Progress value={spent / cat.limit * 100} /></article><div className="category-actions"><button className="delete-button" onClick={() => openEditCategory(cat)} aria-label="Kategoriyi düzenle"><Icon name="check" /></button><button className="delete-button" onClick={() => deleteCategory(cat.id)} aria-label="Kategoriyi sil"><Icon name="trash" /></button></div></div>); })}</section>}

    {incomeForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setIncomeForm({ isOpen: false, mode: 'add' }); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="income-title">
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">GELİR</span><h2 id="income-title">{incomeForm.mode === 'add' ? 'Yeni gelir' : 'Geliri düzenle'}</h2></div><button className="icon-button" onClick={() => setIncomeForm({ isOpen: false, mode: 'add' })} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={incomeName} onChange={e => setIncomeName(e.target.value)} placeholder="Örn: Maaş" /></label>
        <label className="amount-input"><span>Tutar</span><div><input inputMode="decimal" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" aria-label="Gelir tutarı" /><b>TL</b></div></label>
        <label className="field"><input type="checkbox" checked={incomeRecurring} onChange={e => setIncomeRecurring(e.target.checked)} /> Her ay tekrarlanan gelir</label>
        <button className="primary-button" disabled={!incomeName.trim() || Number(incomeAmount) <= 0} onClick={saveIncome}>{incomeForm.mode === 'add' ? 'Geliri kaydet' : 'Güncelle'}</button>
      </section>
    </div>}

    {fixedForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setFixedForm({ isOpen: false, mode: 'add' }); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="fixed-title">
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">OTOMATİK GİDER</span><h2 id="fixed-title">{fixedForm.mode === 'add' ? 'Yeni otomatik gider' : 'Gideri düzenle'}</h2></div><button className="icon-button" onClick={() => setFixedForm({ isOpen: false, mode: 'add' })} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={fixedName} onChange={e => setFixedName(e.target.value)} placeholder="Örn: Netflix" /></label>
        <label className="amount-input"><span>Tutar</span><div><input inputMode="decimal" value={fixedAmount} onChange={e => setFixedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" aria-label="Gider tutarı" /><b>TL</b></div></label>
        <div className="form-grid"><label>Gün (1-31) <input inputMode="numeric" value={fixedDueDay} onChange={e => setFixedDueDay(e.target.value.replace(/[^0-9]/g, ''))} /></label><label>Kategori<select value={fixedCategory} onChange={e => setFixedCategory(e.target.value)}>{uniqueCategories.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <fieldset className="segmented"><legend>Sıklık</legend>{(['monthly', 'yearly'] as const).map(value => <button type="button" key={value} className={fixedFrequency === value ? 'active' : ''} onClick={() => setFixedFrequency(value)}>{value === 'monthly' ? 'Aylık' : 'Yıllık'}</button>)}</fieldset>
        <button className="primary-button" disabled={!fixedName.trim() || Number(fixedAmount) <= 0} onClick={saveFixed}>{fixedForm.mode === 'add' ? 'Gideri kaydet' : 'Güncelle'}</button>
      </section>
</div>}

    {categoryForm.isOpen && <div className="sheet-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCategoryForm({ isOpen: false, mode: 'add' }); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="category-title">
        <div className="sheet__handle" />
        <header className="sheet__header"><div><span className="eyebrow">KATEGORİ BÜĞTESİ</span><h2 id="category-title">{categoryForm.mode === 'add' ? 'Yeni kategori bütçesi' : 'Kategori bütçesini düzenle'}</h2></div><button className="icon-button" onClick={() => setCategoryForm({ isOpen: false, mode: 'add' })} aria-label="Kapat"><Icon name="close" /></button></header>
        <label className="field">Ad <input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="Örn: Market" /></label>
        <label className="amount-input"><span>Limit</span><div><input inputMode="decimal" value={categoryLimit} onChange={e => setCategoryLimit(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" aria-label="Kategori limiti" /><b>TL</b></div></label>
        <label className="field">Renk <input value={categoryColor} onChange={e => setCategoryColor(e.target.value)} placeholder="#538b67" /></label>
        <button className="primary-button" disabled={!categoryName.trim() || !Number.isFinite(Number(categoryLimit)) || Number(categoryLimit) < 0} onClick={saveCategory}>{categoryForm.mode === 'add' ? 'Kategori kaydet' : 'Güncelle'}</button>
      </section>
    </div>}
  </div>
  );
}
export function InvestmentsScreen() {
  const { state, dispatch } = useAkceStore(); const summary = useSummary();
  return <div className="screen"><PageHeader eyebrow="GELECEĞE AYRILAN" title="Yatırımlar" description="Önce geleceğini finanse et, sonra bugünü harca." /><div className="protect-banner"><Icon name="target"/><div><b>Yatırım bütçen koruma altında</b><p>{formatCurrency(summary.totalFixedInvestment)} harcanabilir bütçeye dahil edilmedi.</p></div><strong>%{Math.round(summary.investmentPlanRealizationRate)}</strong></div><section className="investment-grid">{state.investments.map(item => <article className={`investment-card ${item.completed ? 'completed' : ''}`} key={item.id}><span className="asset-monogram">{item.group.slice(0, 2).toLocaleUpperCase('tr-TR')}</span><div><span>{item.group}</span><h3>{formatCurrency(item.plannedAmount)}</h3><small>Aylık plan</small></div><button onClick={() => dispatch({ type: 'TOGGLE_INVESTMENT', id: item.id })}><span>{item.completed && <Icon name="check"/>}</span>{item.completed ? 'Gerçekleşti' : 'Tamamla'}</button></article>)}</section></div>;
}

export function AssetsScreen() {
  const { state, dispatch } = useAkceStore(); const total = getTotalAssets(state.assets); const target = getTotalAssetTargets(state.assets);
  return <div className="screen"><PageHeader eyebrow="ÖZGÜRLÜK KASASI" title="Varlıklar & Hedefler" description="Finansal özgürlüğe olan mesafeni görünür kıl." /><section className="assets-hero"><span>TOPLAM FİNANSAL VARLIK</span><strong>{formatCurrency(total)}</strong><p>Genel hedef: {formatCurrency(target)}</p><Progress value={total / target * 100} tone="gold"/><small>%{Math.round(total / target * 100)} tamamlandı · {formatCurrency(target - total)} kaldı</small></section><section className="asset-grid">{state.assets.map(asset => { const progress = getAssetProgress(asset); return <article className="asset-card" key={asset.id}><header><span className="asset-monogram">{asset.group.slice(0, 2).toLocaleUpperCase('tr-TR')}</span><div><b>{asset.group}</b><small>Hedefin %{Math.round(progress)}’i</small></div></header><h3>{formatCurrency(asset.currentAmount)}</h3><p>{formatCurrency(asset.targetAmount)} hedef</p><Progress value={progress} tone="gold"/><div><span>Hedefe kalan</span><b>{formatCurrency(Math.max(0, asset.targetAmount - asset.currentAmount))}</b></div><button onClick={() => { const value = window.prompt(`${asset.group} güncel tutarı`, String(asset.currentAmount)); if (value !== null && Number.isFinite(Number(value))) dispatch({ type: 'UPDATE_ASSET', id: asset.id, amount: Number(value) }); }}>Tutarı güncelle</button></article>; })}</section></div>;
}

export function CoachScreen() {
  const summary = useSummary(); const advice = coachProvider.getAdvice(summary);
  return <div className="screen"><PageHeader eyebrow="DİSİPLİN SİNYALLERİ" title="Finans Koçu" description="Hesapların finans motorundan, yorumların kurallardan gelir." /><section className="coach-lead"><Icon name="spark"/><div><span>BUGÜNÜN ODAĞI</span><h2>{advice[0].title}</h2><p>{advice[0].message}</p></div></section><div className="coach-metrics"><Metric label="Günlük güvenli limit" value={formatCurrency(summary.dailySafeLimit)} /><Metric label="3 günlük ortalama" value={formatCurrency(summary.threeDayAverage)} /><Metric label="7 günlük ortalama" value={formatCurrency(summary.sevenDayAverage)} /><Metric label="Tahmini ay sonu gideri (son 7g ort.)" value={formatCurrency(summary.monthEndEstimate)} /></div><section className="signals"><h2>Sinyaller</h2>{advice.slice(1).map(item => <article key={item.title} className={`signal signal--${item.tone}`}><span><Icon name={item.tone === 'success' ? 'check' : 'spark'} /></span><div><b>{item.title}</b><p>{item.message}</p></div></article>)}</section></div>;
}

export function SettingsScreen() {
  const { state, dispatch } = useAkceStore();
  return <div className="screen"><PageHeader eyebrow="TERCİHLER" title="Ayarlar" description="Akçe deneyimini kendine göre düzenle." /><section className="settings-card"><div><span>Para birimi</span><b>{state.settings.currency}</b></div><div><span>Bütçe başlangıç günü</span><b>Her ayın {state.settings.monthStartDay}. günü</b></div><div><span>Veri saklama</span><b>Bu cihazda</b></div></section><section className="settings-card"><div><span>Tanıtımı yeniden göster</span><button className="secondary-button" onClick={() => dispatch({ type: 'SET_ONBOARDING', value: true })}>Göster</button></div><div><span>Örnek verileri sıfırla</span><button className="secondary-button secondary-button--danger" onClick={() => dispatch({ type: 'RESET' })}>Sıfırla</button></div></section><p className="settings-note">Akçe V1 verileri yalnızca tarayıcında saklar. Banka ve bulut bağlantısı yoktur.</p></div>;
}
