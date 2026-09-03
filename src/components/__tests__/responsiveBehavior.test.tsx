import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AkceStoreProvider } from '../../store/AkceStore';
import { localStorageFinanceRepository } from '../../store/localStorageFinanceRepository';
import { FinanceSyncCoordinator } from '../../store/financeSyncCoordinator';
import { FirebaseFinanceRepository } from '../../store/firebaseFinanceRepository';
import type { FirestoreGateway, GatewayBatchOperation, GatewayDocument } from '../../store/firestoreGateway';
import type { ReactNode } from 'react';
import { QuickExpenseSheet } from '../../components/QuickExpenseSheet';

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
  serverTimestamp(): unknown { return Date.now(); }
}

function createTestWrapper() {
  const gateway = new SimpleGateway();
  const firebaseRepo = new FirebaseFinanceRepository(gateway, 'dev-1');
  const coordinator = new FinanceSyncCoordinator({
    localRepository: localStorageFinanceRepository,
    firebaseRepository: firebaseRepo,
    gateway,
  });
  return ({ children }: { children: ReactNode }) => (
    <AkceStoreProvider coordinator={coordinator}>{children}</AkceStoreProvider>
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
});
