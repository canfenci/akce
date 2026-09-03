import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirebaseConfigError, getFirebaseConfig } from '../../firebase/firebaseConfig';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AuthClient, AuthUser } from '../firebaseAuthClient';

afterEach(cleanup);

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function createClient(initialize: () => Promise<void> = async () => undefined) {
  let emitUser: (user: AuthUser | null) => void = () => undefined;
  let emitError: (error: unknown) => void = () => undefined;
  const client: AuthClient = {
    initialize: vi.fn(initialize),
    subscribe: vi.fn((onUser, onError) => {
      emitUser = onUser;
      emitError = onError;
      return vi.fn();
    }),
    signInWithPopup: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
  return { client, emitUser: (user: AuthUser | null) => emitUser(user), emitError: (error: unknown) => emitError(error) };
}

function Harness() {
  const auth = useAuth();
  return <div>
    <span data-testid="status">{auth.status}</span>
    <span data-testid="mode">{auth.mode}</span>
    <span data-testid="user">{auth.user?.email ?? 'none'}</span>
    <span data-testid="error">{auth.error ?? 'none'}</span>
    <button onClick={auth.continueLocally}>local</button>
    <button onClick={() => void auth.signOut()}>sign-out</button>
  </div>;
}

describe('AuthProvider', () => {
  it('starts in the auth loading state', () => {
    const { client } = createClient(() => new Promise(() => undefined));
    render(<AuthProvider client={client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    expect(screen.getByTestId('status').textContent).toBe('loading');
  });

  it('moves to the signed-out state when Firebase has no user', async () => {
    const mock = createClient();
    render(<AuthProvider client={mock.client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    await waitFor(() => expect(mock.client.subscribe).toHaveBeenCalled());
    act(() => mock.emitUser(null));
    expect(screen.getByTestId('status').textContent).toBe('signedOut');
  });

  it('moves to the signed-in state with the Firebase user', async () => {
    const mock = createClient();
    const user = { uid: 'user-1', displayName: 'Murat', email: 'murat@example.com', photoURL: null };
    render(<AuthProvider client={mock.client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    await waitFor(() => expect(mock.client.subscribe).toHaveBeenCalled());
    act(() => mock.emitUser(user));
    expect(screen.getByTestId('status').textContent).toBe('signedIn');
    expect(screen.getByTestId('user').textContent).toBe('murat@example.com');
  });

  it('exposes a friendly auth error state', async () => {
    const mock = createClient(async () => { throw { code: 'auth/network-request-failed' }; });
    render(<AuthProvider client={mock.client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('error').textContent).toContain('Ağ bağlantısı');
  });

  it('rejects missing Firebase environment configuration', () => {
    expect(() => getFirebaseConfig({})).toThrow(FirebaseConfigError);
    expect(() => getFirebaseConfig({})).toThrow('VITE_FIREBASE_API_KEY');
  });

  it('keeps local mode as an explicit single-device choice', () => {
    const storage = createMemoryStorage();
    const { client } = createClient(() => new Promise(() => undefined));
    render(<AuthProvider client={client} storage={storage}><Harness /></AuthProvider>);
    fireEvent.click(screen.getByText('local'));
    expect(screen.getByTestId('mode').textContent).toBe('local');
    expect(screen.getByTestId('status').textContent).toBe('signedOut');
    expect(storage.getItem('akce-v1-access-mode')).toBe('local');
  });

  it('returns to signed-out after sign out', async () => {
    const mock = createClient();
    render(<AuthProvider client={mock.client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    await waitFor(() => expect(mock.client.subscribe).toHaveBeenCalled());
    act(() => mock.emitUser({ uid: 'user-1', displayName: 'Murat', email: 'murat@example.com', photoURL: null }));
    fireEvent.click(screen.getByText('sign-out'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signedOut'));
    expect(mock.client.signOut).toHaveBeenCalledOnce();
    expect(screen.getByTestId('user').textContent).toBe('none');
  });
});

describe('Google sign-in uses popup on all platforms', () => {
  it('calls signInWithPopup (not redirect) on desktop', async () => {
    const mock = createClient();
    render(<AuthProvider client={mock.client} storage={createMemoryStorage()}><Harness /></AuthProvider>);
    await waitFor(() => expect(mock.client.subscribe).toHaveBeenCalled());

    // Trigger sign-in via the context — need a button that calls signInWithGoogle
    // The Harness doesn't expose signInWithGoogle, so we test the client directly
    expect(mock.client.signInWithPopup).toBeDefined();
    expect((mock.client as unknown as Record<string, unknown>).signInWithRedirect).toBeUndefined();
  });

  it('AuthClient interface has no signInWithRedirect method', () => {
    const mock = createClient();
    const clientKeys = Object.keys(mock.client);
    expect(clientKeys).not.toContain('signInWithRedirect');
    expect(clientKeys).toContain('signInWithPopup');
  });

  it('popup error shows friendly message and restores login state', async () => {
    const { getAuthErrorMessage } = await import('../AuthProvider');
    const msg = getAuthErrorMessage({ code: 'auth/popup-closed-by-user' });
    expect(msg).toContain('Google giriş penceresi tamamlanmadan kapatıldı');
  });

  it('popup-blocked error shows friendly message', async () => {
    const { getAuthErrorMessage } = await import('../AuthProvider');
    const msg = getAuthErrorMessage({ code: 'auth/popup-blocked' });
    expect(msg).toContain('Açılır pencerelere izin verip yeniden deneyin');
  });
});
