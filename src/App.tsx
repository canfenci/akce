import { useEffect, useState } from 'react';
import { Icon, type IconName } from './components/Icon';
import { QuickExpenseSheet } from './components/QuickExpenseSheet';
import { AssetsScreen, BudgetScreen, CoachScreen, ExpensesScreen, HomeScreen, InvestmentsScreen, SettingsScreen } from './features/Screens';
import { AkceStoreProvider, useAkceStore } from './store/AkceStore';
import { useAuth } from './auth/AuthProvider';
import { AuthLoadingScreen, SignedOutScreen } from './auth/AuthScreens';

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
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); setMenuOpen(false); }, [page]);
  if (state.settings.showOnboarding) return <Onboarding />;
  const navigate = (next: string) => setPage(next as Page);
  const account = mode === 'local'
    ? { label: 'Yerel kullanım', detail: 'Veriler yalnızca bu cihazda', actionLabel: 'Giriş ekranına dön', onAction: leaveLocalMode }
    : { label: user?.displayName || 'Google hesabı', detail: user?.email || '', actionLabel: 'Çıkış yap', onAction: () => void signOut() };
  const screen = page === 'home' ? <HomeScreen goTo={navigate} /> : page === 'expenses' ? <ExpensesScreen openQuick={() => setQuickOpen(true)} /> : page === 'budget' ? <BudgetScreen /> : page === 'investments' ? <InvestmentsScreen /> : page === 'assets' ? <AssetsScreen /> : page === 'coach' ? <CoachScreen /> : <SettingsScreen account={account} mode={mode} />;

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
      <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><Icon name="home"/><span>Ana Sayfa</span></button>
      <button className={page === 'budget' ? 'active' : ''} onClick={() => setPage('budget')}><Icon name="wallet"/><span>Bütçe</span></button>
      <button className="bottom-nav__add" onClick={() => setQuickOpen(true)} aria-label="Hızlı harcama ekle"><Icon name="plus"/></button>
      <button className={page === 'assets' ? 'active' : ''} onClick={() => setPage('assets')}><Icon name="target"/><span>Varlıklar</span></button>
    </nav>
    {menuOpen && <div className="drawer-layer" onMouseDown={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}><aside className="drawer"><header><div className="wordmark">akçe<span>.</span></div><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><Icon name="close"/></button></header><p>Az özellik. Çok disiplin.</p><nav>{navItems.slice(1).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon name={item.icon}/>{item.label}<Icon name="arrow"/></button>)}</nav></aside></div>}
    <QuickExpenseSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
  </div>;
}

export default function App() {
  const { status, mode } = useAuth();
  if (status === 'loading') return <AuthLoadingScreen />;
  if (mode !== 'local' && status !== 'signedIn') return <SignedOutScreen />;
  return <AkceStoreProvider><FinanceApp /></AkceStoreProvider>;
}
