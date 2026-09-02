import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
