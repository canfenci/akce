import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { QuickExpenseSheet } from './components/QuickExpenseSheet';
import { QuickAddSheet, type QuickAddAction } from './components/QuickAddSheet';
import { AssetsScreen, BudgetScreen, CoachScreen, ExpensesScreen, HomeScreen, InvestmentsScreen, SettingsScreen } from './features/Screens';
import { AkceStoreProvider, useAkceStore } from './store/AkceStore';
import { useAuth } from './auth/AuthProvider';
import { AuthLoadingScreen, SignedOutScreen } from './auth/AuthScreens';
import type { Expense } from './domain/types';

type Page = 'home' | 'expenses' | 'budget' | 'investments' | 'assets' | 'coach' | 'settings';
const navItems: { id: Page; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Ana Sayfa', icon: 'home' }, { id: 'expenses', label: 'Harcamalar', icon: 'receipt' },
  { id: 'budget', label: 'Bütçe', icon: 'wallet' }, { id: 'investments', label: 'Yatırımlar', icon: 'chart' },
  { id: 'assets', label: 'Varlıklar & Hedefler', icon: 'target' }, { id: 'coach', label: 'Finans Koçu', icon: 'spark' },
  { id: 'settings', label: 'Ayarlar', icon: 'settings' },
];

function Onboarding() {
  const { dispatch } = useAkceStore();
  return <div className="onboarding"><div className="onboarding__mark">akçe.</div><div className="onboarding__content"><span>FİNANSAL DİSİPLİN, SADELEŞTİRİLDİ</span><h1>Önce geleceğini finanse et, sonra bugünü harca.</h1><p>Günlük güvenli limitini gör. Yatırım paranı koru. Özgürlük hedefine her ay biraz daha yaklaş.</p><button onClick={() => dispatch({ type: 'SET_ONBOARDING', value: false })}>Akçe’yi kullan <Icon name="arrow" /></button></div><button className="onboarding__skip" onClick={() => dispatch({ type: 'SET_ONBOARDING', value: false })}>Atla</button></div>;
}

function FinanceApp() {
  const { state, syncStatus } = useAkceStore();
  const { mode, user, signOut, leaveLocalMode } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [openFormSignal, setOpenFormSignal] = useState<QuickAddAction | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const lastExpenseCategory = useRef('Market');
  const lastExpenseType = useRef<Expense['type']>('zorunlu');
  const lastExpensePaymentMethod = useRef<Expense['paymentMethod']>('kart');
  useEffect(() => { window.scrollTo({ top: 0 }); setMenuOpen(false); }, [page]);
  if (state.settings.showOnboarding) return <Onboarding />;
  const navigate = (next: string) => setPage(next as Page);
  const account = mode === 'local'
    ? { label: 'Yerel kullanım', detail: 'Veriler yalnızca bu cihazda', actionLabel: 'Giriş ekranına dön', onAction: leaveLocalMode }
    : { label: user?.displayName || 'Google hesabı', detail: user?.email || '', actionLabel: 'Çıkış yap', onAction: () => void signOut() };
  const screen = page === 'home' ? <HomeScreen goTo={navigate} /> : page === 'expenses' ? <ExpensesScreen openQuick={() => setQuickOpen(true)} openFormSignal={openFormSignal} onFormSignalConsumed={() => setOpenFormSignal(null)} /> : page === 'budget' ? <BudgetScreen openFormSignal={openFormSignal} onFormSignalConsumed={() => setOpenFormSignal(null)} /> : page === 'investments' ? <InvestmentsScreen openFormSignal={openFormSignal} onFormSignalConsumed={() => setOpenFormSignal(null)} /> : page === 'assets' ? <AssetsScreen openFormSignal={openFormSignal} onFormSignalConsumed={() => setOpenFormSignal(null)} /> : page === 'coach' ? <CoachScreen /> : <SettingsScreen account={account} mode={mode} />;

  const syncFooter = mode === 'local'
    ? { title: 'Veriler cihazında', subtitle: 'Akçe V1 · Çevrimdışı hazır' }
    : syncStatus === 'migrating'
    ? { title: 'Aktarılıyor…', subtitle: 'Bulut eşitlemesi yapılıyor' }
    : syncStatus === 'syncing'
    ? { title: 'Senkronize ediliyor…', subtitle: 'Bulut güncelleniyor' }
    : syncStatus === 'synced'
    ? { title: 'Senkronize edildi', subtitle: 'Bulut korumalı' }
    : syncStatus === 'offline'
    ? { title: 'Çevrimdışı', subtitle: 'Bağlantı bekleniyor' }
    : syncStatus === 'error'
    ? { title: 'Senkronizasyon hatası', subtitle: 'Yeniden denenecek' }
    : { title: 'Bulut hazır', subtitle: 'Eşitleme hazır' };

  return <div className="app-shell">
    <aside className="sidebar"><div className="wordmark">akçe<span>.</span></div><p className="sidebar__tagline">Az özellik.<br/>Çok disiplin.</p><nav>{navItems.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon name={item.icon}/><span>{item.label}</span>{page === item.id && <i/>}</button>)}</nav><div className="sidebar__footer"><span className="sidebar__pulse"/><div><b>{syncFooter.title}</b><small>{syncFooter.subtitle}</small></div></div></aside>
    <header className="mobile-header"><button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç"><Icon name="menu"/></button><div className="wordmark">akçe<span>.</span></div><button className="avatar" aria-label="Profil">MB</button></header>
    <main>{screen}</main>
    <nav className="bottom-nav">
      <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')} style={{ gridColumn: 1 }}><Icon name="home"/><span>Ana Sayfa</span></button>
      <button className={page === 'budget' ? 'active' : ''} onClick={() => setPage('budget')} style={{ gridColumn: 2 }}><Icon name="wallet"/><span>Bütçe</span></button>
      <button className="bottom-nav__add" ref={fabRef} onClick={() => setQuickAddOpen(true)} aria-label="Hızlı ekle"><Icon name="plus"/></button>
      <button className={page === 'assets' ? 'active' : ''} onClick={() => setPage('assets')} style={{ gridColumn: 4 }}><Icon name="target"/><span>Varlıklar</span></button>
      <button className={page === 'investments' ? 'active' : ''} onClick={() => setPage('investments')} style={{ gridColumn: 5 }}><Icon name="chart"/><span>Yatırımlar</span></button>
    </nav>
    {menuOpen && <div className="drawer-layer" onMouseDown={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}><aside className="drawer"><header><div className="wordmark">akçe<span>.</span></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><Icon name="close"/></button></header><p>Az özellik. Çok disiplin.</p><nav>{navItems.slice(1).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon name={item.icon}/>{item.label}<Icon name="arrow"/></button>)}</nav></aside></div>}
    <QuickAddSheet open={quickAddOpen} onClose={() => { setQuickAddOpen(false); fabRef.current?.focus(); }} onSelect={action => {
      setQuickAddOpen(false);
      if (action === 'expense') { setQuickOpen(true); return; }
      const targetPage = action === 'income' ? 'budget' : action === 'investment' ? 'investments' : 'assets';
      setPage(targetPage as Page);
      setOpenFormSignal(action);
    }} />
    <QuickExpenseSheet open={quickOpen} onClose={() => setQuickOpen(false)}
      initialCategory={lastExpenseCategory.current}
      initialType={lastExpenseType.current}
      initialPaymentMethod={lastExpensePaymentMethod.current}
      onSave={(category, type, paymentMethod) => {
        lastExpenseCategory.current = category;
        lastExpenseType.current = type;
        lastExpensePaymentMethod.current = paymentMethod;
      }} />
  </div>;
}

export default function App() {
  const { status, mode } = useAuth();
  if (status === 'loading') return <AuthLoadingScreen />;
  if (mode !== 'local' && status !== 'signedIn') return <SignedOutScreen />;
  return <AkceStoreProvider><FinanceApp /></AkceStoreProvider>;
}
