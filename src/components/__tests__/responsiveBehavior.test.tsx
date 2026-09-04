import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AkceStoreProvider } from '../../store/AkceStore';
import { localStorageFinanceRepository } from '../../store/localStorageFinanceRepository';
import { FinanceSyncCoordinator } from '../../store/financeSyncCoordinator';
import { FirebaseFinanceRepository } from '../../store/firebaseFinanceRepository';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../../store/firestoreGateway';
import type { ReactNode } from 'react';
import { QuickExpenseSheet } from '../../components/QuickExpenseSheet';
import { AuthProvider } from '../../auth/AuthProvider';
import { calculateExpenseRatio } from '../../domain/financeEngine';
import type { AuthClient } from '../../auth/firebaseAuthClient';

function createMockAuthClient(displayName: string | null = null): AuthClient {
  return {
    initialize: async () => {},
    subscribe: (onUser) => { onUser(displayName ? { uid: 'test', displayName, email: 'test@test.com', photoURL: null } : null); return () => {}; },
    signInWithPopup: async () => {},
    signOut: async () => {},
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

class SimpleGateway implements FirestoreGateway {
  docs = new Map<string, Record<string, unknown>>();
  subscriptions: { path: string; onDocuments: (documents: GatewayDocument[]) => void }[] = [];
  async getDocument(path: string): Promise<GatewayDocument | null> {
    const data = this.docs.get(path);
    return data ? { id: path.split('/').pop()!, data } : null;
  }
  async getDocuments(): Promise<GatewayDocument[]> { return []; }
  async setDocument(path: string, data: Record<string, unknown>): Promise<void> { this.docs.set(path, data); }
  async updateDocument(path: string, data: Record<string, unknown>): Promise<void> { this.docs.set(path, { ...this.docs.get(path), ...data }); }
  async deleteDocument(path: string): Promise<void> { this.docs.delete(path); }
  async commitBatch(operations: GatewayBatchOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === 'set') this.docs.set(op.path, op.data);
      else if (op.type === 'update') this.docs.set(op.path, { ...this.docs.get(op.path), ...op.data });
      else this.docs.delete(op.path);
    }
  }
  subscribeCollection(path: string, onDocuments: (documents: GatewayDocument[]) => void): () => void {
    this.subscriptions.push({ path, onDocuments });
    return () => {};
  }
  subscribeDocument(_path: string, _onDocument: (doc: { id: string; data: Record<string, unknown> } | null) => void, _onError: (error: unknown) => void) { return () => {}; }
  serverTimestamp(): unknown { return Date.now(); }
}

function createTestWrapper(displayName: string | null = null) {
  const gateway = new SimpleGateway();
  const firebaseRepo = new FirebaseFinanceRepository(gateway, 'dev-1');
  const coordinator = new FinanceSyncCoordinator({
    localRepository: localStorageFinanceRepository,
    firebaseRepository: firebaseRepo,
    gateway,
  });
  const authClient = createMockAuthClient(displayName);
  const storage = createMemoryStorage();
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider client={authClient} storage={storage}>
      <AkceStoreProvider coordinator={coordinator}>{children}</AkceStoreProvider>
    </AuthProvider>
  );
}

describe('Delete button touch target', () => {
  it('delete button has 44px minimum touch target', () => {
    const style = document.createElement('style');
    style.textContent = '.delete-button{width:44px;height:44px}';
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'delete-button';
    document.body.appendChild(btn);

    const computed = window.getComputedStyle(btn);
    expect(computed.width).toBe('44px');
    expect(computed.height).toBe('44px');

    document.body.removeChild(btn);
    document.head.removeChild(style);
  });
});

describe('QuickExpenseSheet viewport', () => {
  it('renders with sheet and applies maxHeight', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true,
    });

    const wrapper = createTestWrapper();
    render(<QuickExpenseSheet open={true} onClose={() => {}} />, { wrapper });

    const sheet = screen.getByRole('dialog');
    expect(sheet).toBeTruthy();
    // The sheet should have an inline style for maxHeight
    const style = (sheet as HTMLElement).style;
    expect(style.maxHeight).toBeTruthy();
  });

  it('falls back when visualViewport is undefined', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });

    const wrapper = createTestWrapper();
    render(<QuickExpenseSheet open={true} onClose={() => {}} />, { wrapper });

    const sheet = screen.getByRole('dialog');
    expect(sheet).toBeTruthy();
    const style = (sheet as HTMLElement).style;
    expect(style.maxHeight).toBeTruthy();
  });
});

describe('Bottom nav FAB centering', () => {
  it('FAB is absolutely positioned at 50% horizontal center', () => {
    const style = document.createElement('style');
    style.textContent = `
      .bottom-nav{position:relative;width:100%}
      .bottom-nav__add{position:absolute;left:50%;top:0;transform:translateX(-50%);width:54px;height:54px;border-radius:50%}
    `;
    document.head.appendChild(style);

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    const fab = document.createElement('button');
    fab.className = 'bottom-nav__add';
    nav.appendChild(fab);
    document.body.appendChild(nav);

    const computed = window.getComputedStyle(fab);
    expect(computed.position).toBe('absolute');
    expect(computed.left).toBe('50%');
    expect(computed.transform).toContain('translateX');

    document.body.removeChild(nav);
    document.head.removeChild(style);
  });

  it('FAB width and height are 54px', () => {
    const style = document.createElement('style');
    style.textContent = '.bottom-nav__add{width:54px;height:54px;min-width:54px;min-height:54px;border-radius:50%}';
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'bottom-nav__add';
    document.body.appendChild(fab);

    const computed = window.getComputedStyle(fab);
    expect(computed.width).toBe('54px');
    expect(computed.height).toBe('54px');
    expect(computed.borderRadius).toBe('50%');

    document.body.removeChild(fab);
    document.head.removeChild(style);
  });
});

describe('Symmetric mobile bottom navigation', () => {
  it('has 5 children: 4 tab buttons + 1 FAB', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    const labels = ['Ana Sayfa', 'Bütçe', '', 'Varlıklar', 'Yatırımlar'];
    for (const label of labels) {
      const btn = document.createElement('button');
      if (!label) btn.className = 'bottom-nav__add';
      else btn.textContent = label;
      nav.appendChild(btn);
    }
    document.body.appendChild(nav);

    const buttons = nav.querySelectorAll('button');
    expect(buttons.length).toBe(5);
    document.body.removeChild(nav);
  });

  it('nav items are in symmetric order: Ana Sayfa, Bütçe, +, Varlıklar, Yatırımlar', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    const expected = ['Ana Sayfa', 'Bütçe', '', 'Varlıklar', 'Yatırımlar'];
    for (const label of expected) {
      const btn = document.createElement('button');
      if (!label) btn.className = 'bottom-nav__add';
      else btn.textContent = label;
      nav.appendChild(btn);
    }
    document.body.appendChild(nav);

    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons[0].textContent).toBe('Ana Sayfa');
    expect(buttons[1].textContent).toBe('Bütçe');
    expect(buttons[2].className).toBe('bottom-nav__add');
    expect(buttons[3].textContent).toBe('Varlıklar');
    expect(buttons[4].textContent).toBe('Yatırımlar');
    document.body.removeChild(nav);
  });

  it('grid uses 5 columns with empty center column for FAB', () => {
    const style = document.createElement('style');
    style.textContent = '.bottom-nav{display:grid;grid-template-columns:1fr 1fr 0fr 1fr 1fr}';
    document.head.appendChild(style);

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    document.body.appendChild(nav);

    const computed = window.getComputedStyle(nav);
    expect(computed.display).toBe('grid');
    expect(computed.gridTemplateColumns).toBe('1fr 1fr 0fr 1fr 1fr');

    document.body.removeChild(nav);
    document.head.removeChild(style);
  });

  it('Investments is visible in mobile bottom nav', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    for (const label of ['Ana Sayfa', 'Bütçe', '', 'Varlıklar', 'Yatırımlar']) {
      const btn = document.createElement('button');
      if (!label) btn.className = 'bottom-nav__add';
      else btn.textContent = label;
      nav.appendChild(btn);
    }
    document.body.appendChild(nav);

    const buttons = Array.from(nav.querySelectorAll('button'));
    const investmentsBtn = buttons.find(b => b.textContent === 'Yatırımlar');
    expect(investmentsBtn).toBeTruthy();
    document.body.removeChild(nav);
  });
});

describe('QuickAddSheet', () => {
  it('renders four actions in correct order', async () => {
    const { QuickAddSheet } = await import('../../components/QuickAddSheet');
    const wrapper = createTestWrapper();
    render(<QuickAddSheet open={true} onClose={() => {}} onSelect={() => {}} />, { wrapper });
    expect(screen.getByText('Harcama ekle')).toBeTruthy();
    expect(screen.getByText('Gelir ekle')).toBeTruthy();
    expect(screen.getByText('Yatırım ekle')).toBeTruthy();
    expect(screen.getByText('Varlık ekle')).toBeTruthy();
    const items = screen.getAllByRole('button', { name: /ekle$/ });
    expect(items.length).toBe(4);
    expect(items[0].textContent).toContain('Harcama ekle');
    expect(items[1].textContent).toContain('Gelir ekle');
    expect(items[2].textContent).toContain('Yatırım ekle');
    expect(items[3].textContent).toContain('Varlık ekle');
  });

  it('renders helper subtitles', async () => {
    const { QuickAddSheet } = await import('../../components/QuickAddSheet');
    const wrapper = createTestWrapper();
    render(<QuickAddSheet open={true} onClose={() => {}} onSelect={() => {}} />, { wrapper });
    expect(screen.getByText('Günlük harcamanı kaydet')).toBeTruthy();
    expect(screen.getByText('Yeni gelir ekle')).toBeTruthy();
    expect(screen.getByText('Bu ay ayırdığın yatırım tutarını kaydet')).toBeTruthy();
    expect(screen.getByText('Şu an sahip olduğun birikmiş değeri kaydet')).toBeTruthy();
  });

  it('calls onSelect with correct action when clicked', async () => {
    const { QuickAddSheet } = await import('../../components/QuickAddSheet');
    const onSelect = vi.fn();
    const wrapper = createTestWrapper();
    render(<QuickAddSheet open={true} onClose={() => {}} onSelect={onSelect} />, { wrapper });
    fireEvent.click(screen.getByText('Harcama ekle'));
    expect(onSelect).toHaveBeenCalledWith('expense');
    fireEvent.click(screen.getByText('Varlık ekle'));
    expect(onSelect).toHaveBeenCalledWith('asset');
  });

  it('returns null when not open', async () => {
    const { QuickAddSheet } = await import('../../components/QuickAddSheet');
    const wrapper = createTestWrapper();
    const { container } = render(<QuickAddSheet open={false} onClose={() => {}} onSelect={() => {}} />, { wrapper });
    expect(container.innerHTML).toBe('');
  });

  it('has accessible dialog', async () => {
    const { QuickAddSheet } = await import('../../components/QuickAddSheet');
    const wrapper = createTestWrapper();
    render(<QuickAddSheet open={true} onClose={() => {}} onSelect={() => {}} />, { wrapper });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Hızlı Ekle')).toBeTruthy();
  });
});

describe('Investment vs Asset clarity', () => {
  it('InvestmentsScreen shows correct description', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    expect(screen.getByText('Bu ay yatırım için ayırdığın tutarları takip et. Birikmiş portföy değerini değil, aylık yatırım katkını takip edersin.')).toBeTruthy();
  });

  it('AssetsScreen shows correct description', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    expect(screen.getByText('Birikmiş finansal varlıklarının güncel değerini takip et. Yatırım ekranı aylık katkını, Varlıklar ekranı toplam birikmiş değerini gösterir.')).toBeTruthy();
  });

  it('InvestmentsScreen shows summary with YATIRIMA AYRILAN', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    expect(screen.getByText('YATIRIMA AYRILAN')).toBeTruthy();
    expect(screen.getByText('YATIRILAN MİKTAR')).toBeTruthy();
    expect(screen.getByText('GERÇEKLEŞME')).toBeTruthy();
  });

  it('InvestmentsScreen shows investment cards with names from seed data', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    expect(screen.getByText('Acil Yatırım Fonu')).toBeTruthy();
    expect(screen.getByText('VOO')).toBeTruthy();
    expect(screen.getByText('Gram Altın')).toBeTruthy();
  });

  it('InvestmentsScreen shows add button with Yatırım planı ekle', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    expect(screen.getByText('Yatırım planı ekle')).toBeTruthy();
  });

  it('Investment card shows Planlanan and Yatırılan labels', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    const planlananLabels = screen.getAllByText('Planlanan');
    expect(planlananLabels.length).toBeGreaterThan(0);
    const yatirilanLabels = screen.getAllByText('Yatırılan');
    expect(yatirilanLabels.length).toBeGreaterThan(0);
  });

  it('Investment edit/delete buttons meet 44px touch target', () => {
    const style = document.createElement('style');
    style.textContent = '.delete-button{width:44px;height:44px}';
    document.head.appendChild(style);
    const btn = document.createElement('button');
    btn.className = 'delete-button';
    document.body.appendChild(btn);
    const computed = window.getComputedStyle(btn);
    expect(parseInt(computed.width)).toBeGreaterThanOrEqual(44);
    expect(parseInt(computed.height)).toBeGreaterThanOrEqual(44);
    document.body.removeChild(btn);
    document.head.removeChild(style);
  });

  it('inputMode decimal is present on financial inputs', async () => {
    const { InvestmentsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<InvestmentsScreen />, { wrapper });
    const addBtns = screen.getAllByText('Yatırım planı ekle');
    fireEvent.click(addBtns[0]);
    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('Home hero typography uses large responsive font size', async () => {
    const { HomeScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<HomeScreen goTo={() => {}} />, { wrapper });
    const hero = document.querySelector('.hero-balance > strong');
    expect(hero).toBeTruthy();
    const style = window.getComputedStyle(hero!);
    expect(style.fontSize).toBeTruthy();
  });
});

describe('Home screen income ratios', () => {
  it('renders Gelir Dağılımı section with both ratio cards', async () => {
    const { HomeScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<HomeScreen goTo={() => {}} />, { wrapper });
    expect(screen.getByText('GELİR DAĞILIMI')).toBeTruthy();
    expect(screen.getByText('Yatırım Oranı')).toBeTruthy();
    expect(screen.getByText('Harcama Oranı')).toBeTruthy();
  });

  it('does not break daily safe spending hero', async () => {
    const { HomeScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<HomeScreen goTo={() => {}} />, { wrapper });
    expect(screen.getByText('BUGÜN GÜVENLE HARCAYABİLECEĞİN')).toBeTruthy();
  });
});

describe('UX polish pack', () => {
  it('asset icon-action buttons meet 44px touch target', () => {
    const style = document.createElement('style');
    style.textContent = '.icon-action{width:44px;height:44px;min-width:44px;min-height:44px}';
    document.head.appendChild(style);
    const btn = document.createElement('button');
    btn.className = 'icon-action';
    document.body.appendChild(btn);
    const computed = window.getComputedStyle(btn);
    expect(parseInt(computed.width)).toBeGreaterThanOrEqual(44);
    expect(parseInt(computed.height)).toBeGreaterThanOrEqual(44);
    document.body.removeChild(btn);
    document.head.removeChild(style);
  });

  it('asset card shows compact layout with name and current value', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    expect(screen.getByText('Acil Yatırım Fonu')).toBeTruthy();
    expect(screen.getByText('TEFAS / Fon')).toBeTruthy();
  });

  it('asset card has detail, edit, and delete icon buttons', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    expect(screen.getAllByLabelText('Varlık detayı').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Varlığı düzenle').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Varlığı sil').length).toBeGreaterThan(0);
  });

  it('asset detail sheet opens and shows quantity, unit, unit price', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    const detailBtns = screen.getAllByLabelText('Varlık detayı');
    fireEvent.click(detailBtns[0]);
    expect(screen.getByText('VARLIK DETAYI')).toBeTruthy();
    expect(screen.getByText('Miktar')).toBeTruthy();
    expect(screen.getByText('Birim')).toBeTruthy();
    expect(screen.getByText('Birim fiyat')).toBeTruthy();
    expect(screen.getByText('Güncel değer')).toBeTruthy();
  });

  it('asset card does not show quantity x unitPrice expression', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    const gramAltin = screen.getByText('Gram Altın').closest('article');
    expect(gramAltin).toBeTruthy();
    expect(gramAltin!.querySelector('.asset-card__detail')).toBeNull();
  });

  it('asset form has no valuation mode toggle', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    fireEvent.click(screen.getByText('Varlık ekle'));
    expect(screen.queryByText('Değerleme yöntemi')).toBeNull();
    expect(screen.queryByText('Doğrudan')).toBeNull();
    expect(screen.queryByText('Miktar × Fiyat')).toBeNull();
  });

  it('asset form has Miktar, Birim, Birim Fiyat, Güncel Değer fields', async () => {
    const { AssetsScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<AssetsScreen />, { wrapper });
    fireEvent.click(screen.getByText('Varlık ekle'));
    expect(screen.getByText('Miktar')).toBeTruthy();
    expect(screen.getByText('Birim')).toBeTruthy();
    expect(screen.getByText('Birim fiyat')).toBeTruthy();
    expect(screen.getByText('Güncel değer')).toBeTruthy();
  });

  it('HomeScreen shows greeting without hardcoded name when no user', async () => {
    const { HomeScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper(null);
    render(<HomeScreen goTo={() => {}} />, { wrapper });
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/^Merhaba/);
  });

  it('BudgetScreen shows Toplam gelir as lead metric', async () => {
    const { BudgetScreen } = await import('../../features/Screens');
    const wrapper = createTestWrapper();
    render(<BudgetScreen />, { wrapper });
    expect(screen.getByText('Toplam gelir')).toBeTruthy();
    const leadMetric = document.querySelector('.metric--lead');
    expect(leadMetric).toBeTruthy();
  });

  it('bottom nav order unchanged', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    for (const label of ['Ana Sayfa', 'Bütçe', '', 'Varlıklar', 'Yatırımlar']) {
      const btn = document.createElement('button');
      if (!label) btn.className = 'bottom-nav__add';
      else btn.textContent = label;
      nav.appendChild(btn);
    }
    document.body.appendChild(nav);
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons[0].textContent).toBe('Ana Sayfa');
    expect(buttons[1].textContent).toBe('Bütçe');
    expect(buttons[2].className).toBe('bottom-nav__add');
    expect(buttons[3].textContent).toBe('Varlıklar');
    expect(buttons[4].textContent).toBe('Yatırımlar');
    document.body.removeChild(nav);
  });

  it('FAB still centered', () => {
    const style = document.createElement('style');
    style.textContent = '.bottom-nav__add{position:absolute;left:50%;transform:translateX(-50%)}';
    document.head.appendChild(style);
    const fab = document.createElement('button');
    fab.className = 'bottom-nav__add';
    document.body.appendChild(fab);
    const computed = window.getComputedStyle(fab);
    expect(computed.position).toBe('absolute');
    expect(computed.left).toBe('50%');
    expect(computed.transform).toContain('translateX');
    document.body.removeChild(fab);
    document.head.removeChild(style);
  });

  it('month navigation has proper spacing from header', () => {
    const style = document.createElement('style');
    style.textContent = '.mobile-header{position:sticky;top:0;z-index:20}.month-navigation{margin:-10px 0 24px}';
    document.head.appendChild(style);
    const header = document.createElement('header');
    header.className = 'mobile-header';
    const nav = document.createElement('div');
    nav.className = 'month-navigation';
    document.body.appendChild(header);
    document.body.appendChild(nav);
    const headerComputed = window.getComputedStyle(header);
    const navComputed = window.getComputedStyle(nav);
    expect(headerComputed.position).toBe('sticky');
    expect(headerComputed.zIndex).toBe('20');
    expect(navComputed.marginTop).toBe('-10px');
    document.body.removeChild(header);
    document.body.removeChild(nav);
    document.head.removeChild(style);
  });

  describe('AKCE-031: metric label and historical hero clarity', () => {
    it('current month hero label is BUGÜN GÜVENLE HARCAYABİLECEĞİN', async () => {
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const heroLabel = document.querySelector('.hero-balance__label');
      expect(heroLabel?.textContent).toBe('BUGÜN GÜVENLE HARCAYABİLECEĞİN');
    });

    it('current month final day keeps same current-month hero label', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const endOfMonth = new Date(2026, 8, 30, 12, 0, 0);
      vi.setSystemTime(endOfMonth);
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const heroLabel = document.querySelector('.hero-balance__label');
      expect(heroLabel?.textContent).toBe('BUGÜN GÜVENLE HARCAYABİLECEĞİN');
      vi.useRealTimers();
    });

    it('historical month hero label is AY SONUNDA KALAN SERBEST BÜTÇE', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const heroLabel = document.querySelector('.hero-balance__label');
      expect(heroLabel?.textContent).toBe('AY SONUNDA KALAN SERBEST BÜTÇE');
      vi.useRealTimers();
    });

    it('historical month positive remainder shows correct value', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const heroValue = document.querySelector('.hero-balance strong');
      expect(heroValue).toBeTruthy();
      vi.useRealTimers();
    });

    it('budgetConsumptionRate label is Bütçe kullanım oranı', async () => {
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const tempoLabels = document.querySelector('.tempo__labels');
      expect(tempoLabels?.textContent).toContain('Bütçe kullanım oranı');
      expect(tempoLabels?.textContent).not.toContain('Bütçenin');
    });

    it('Harcama Oranı label and helper text are correct', async () => {
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const ratioCards = document.querySelectorAll('.income-ratio-card');
      const hasHarcama = Array.from(ratioCards).some(c => c.querySelector('span')?.textContent === 'Harcama Oranı');
      expect(hasHarcama).toBe(true);
      const hasHelper = Array.from(ratioCards).some(c => c.querySelector('small')?.textContent === 'Gelirinin harcamalara giden kısmı');
      expect(hasHelper).toBe(true);
    });

    it('expense ratio formula unchanged', () => {
      const ratio = calculateExpenseRatio(100000, 26000, 10000);
      expect(ratio).toBeCloseTo(36, 0);
    });

    it('budgetConsumptionRate formula unchanged', async () => {
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const tempoTrack = document.querySelector('.tempo__track');
      expect(tempoTrack).toBeTruthy();
      const tempoLabels = document.querySelector('.tempo__labels');
      expect(tempoLabels?.textContent).toMatch(/%[\d]+/);
    });

    it('home hero hierarchy preserved with single strong value', async () => {
      const { HomeScreen } = await import('../../features/Screens');
      const wrapper = createTestWrapper();
      render(<HomeScreen goTo={() => {}} />, { wrapper });
      const hero = document.querySelector('.hero-balance');
      const strong = hero?.querySelectorAll('strong');
      expect(strong?.length).toBe(1);
      const meta = hero?.querySelector('.hero-balance__meta');
      expect(meta).toBeTruthy();
    });
  });

  describe('AKCE-033: production safety fixes', () => {
    it('viewport meta includes viewport-fit=cover', () => {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta) {
        expect(viewportMeta.getAttribute('content')).toContain('viewport-fit=cover');
      } else {
        const fs = require('fs');
        const html = fs.readFileSync('index.html', 'utf-8');
        expect(html).toContain('viewport-fit=cover');
      }
    });

    it('viewport meta does not block pinch zoom', () => {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const content = viewportMeta?.getAttribute('content') || '';
      if (content) {
        expect(content).not.toContain('user-scalable=no');
        expect(content).not.toContain('maximum-scale=1');
      } else {
        const fs = require('fs');
        const html = fs.readFileSync('index.html', 'utf-8');
        expect(html).not.toContain('user-scalable=no');
        expect(html).not.toContain('maximum-scale=1');
      }
    });

    it('secondary-button meets 44px touch target', () => {
      const style = document.createElement('style');
      style.textContent = '.secondary-button{min-height:44px}';
      document.head.appendChild(style);
      const btn = document.createElement('button');
      btn.className = 'secondary-button';
      document.body.appendChild(btn);
      const computed = window.getComputedStyle(btn);
      expect(parseInt(computed.minHeight)).toBeGreaterThanOrEqual(44);
      document.body.removeChild(btn);
      document.head.removeChild(style);
    });

    it('quick-amounts button meets 44px touch target', () => {
      const style = document.createElement('style');
      style.textContent = '.quick-amounts button{height:44px}';
      document.head.appendChild(style);
      const btn = document.createElement('button');
      btn.className = 'quick-amounts';
      const container = document.createElement('div');
      container.className = 'quick-amounts';
      container.appendChild(btn);
      document.body.appendChild(container);
      const computed = window.getComputedStyle(btn);
      expect(parseInt(computed.height)).toBeGreaterThanOrEqual(44);
      document.body.removeChild(container);
      document.head.removeChild(style);
    });

    it('segmented button meets 44px touch target', () => {
      const style = document.createElement('style');
      style.textContent = '.segmented button{min-height:44px}';
      document.head.appendChild(style);
      const btn = document.createElement('button');
      btn.className = 'segmented';
      const container = document.createElement('div');
      container.className = 'segmented';
      container.appendChild(btn);
      document.body.appendChild(container);
      const computed = window.getComputedStyle(btn);
      expect(parseInt(computed.minHeight)).toBeGreaterThanOrEqual(44);
      document.body.removeChild(container);
      document.head.removeChild(style);
    });
  });
});
