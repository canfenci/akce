import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FirebaseConfigError } from '../firebase/firebaseConfig';
import { createFirebaseAuthClient, type AuthClient, type AuthUser } from './firebaseAuthClient';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'error';
export type AuthMode = 'firebase' | 'local';

interface AuthContextValue {
  status: AuthStatus;
  mode: AuthMode;
  user: AuthUser | null;
  error: string | null;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  continueLocally(): void;
  leaveLocalMode(): void;
}

const localModeKey = 'akce-v1-access-mode';
const AuthContext = createContext<AuthContextValue | null>(null);
type ModeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseConfigError) return error.message;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'auth/popup-closed-by-user') return 'Google giriş penceresi tamamlanmadan kapatıldı.';
  if (code === 'auth/popup-blocked') return 'Tarayıcı Google giriş penceresini engelledi. Açılır pencerelere izin verip yeniden deneyin.';
  if (code === 'auth/network-request-failed') return 'Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edip yeniden deneyin.';
  if (code === 'auth/unauthorized-domain') return 'Bu alan adı Firebase Authentication için yetkilendirilmemiş.';
  return 'Google ile giriş tamamlanamadı. Lütfen yeniden deneyin.';
}

export function AuthProvider({
  children,
  client,
  storage = localStorage,
}: {
  children: ReactNode;
  client?: AuthClient;
  storage?: ModeStorage;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [mode, setMode] = useState<AuthMode>('firebase');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeClient, setActiveClient] = useState<AuthClient | null>(client ?? null);

  useEffect(() => {
    if (storage.getItem(localModeKey) === 'local') {
      setMode('local');
      setStatus('signedOut');
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    try {
      const authClient = client ?? createFirebaseAuthClient();
      setActiveClient(authClient);
      void authClient.initialize().then(() => {
        if (cancelled) return;
        unsubscribe = authClient.subscribe(
          nextUser => {
            setUser(nextUser);
            setError(null);
            setStatus(nextUser ? 'signedIn' : 'signedOut');
          },
          authError => {
            setError(getAuthErrorMessage(authError));
            setStatus('error');
          },
        );
      }).catch(authError => {
        if (!cancelled) {
          setError(getAuthErrorMessage(authError));
          setStatus('error');
        }
      });
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
      setStatus('error');
    }
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client, storage]);

  const signInWithGoogle = useCallback(async () => {
    if (!activeClient) {
      setError('Firebase yapılandırması olmadan Google girişi başlatılamaz.');
      setStatus('error');
      return;
    }
    setError(null);
    try {
      await activeClient.signInWithPopup();
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
      setStatus('error');
    }
  }, [activeClient]);

  const signOutUser = useCallback(async () => {
    if (!activeClient) return;
    try {
      await activeClient.signOut();
      setUser(null);
      setError(null);
      setStatus('signedOut');
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
      setStatus('error');
    }
  }, [activeClient]);

  const continueLocally = useCallback(() => {
    storage.setItem(localModeKey, 'local');
    setMode('local');
    setError(null);
    setStatus('signedOut');
  }, [storage]);

  const leaveLocalMode = useCallback(() => {
    storage.removeItem(localModeKey);
    setMode('firebase');
    setStatus('loading');
    window.location.reload();
  }, [storage]);

  const value = useMemo(() => ({ status, mode, user, error, signInWithGoogle, signOut: signOutUser, continueLocally, leaveLocalMode }), [status, mode, user, error, signInWithGoogle, signOutUser, continueLocally, leaveLocalMode]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
