import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../firebase/firebaseApp';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface AuthClient {
  initialize(): Promise<void>;
  subscribe(onUser: (user: AuthUser | null) => void, onError: (error: unknown) => void): () => void;
  signInWithPopup(): Promise<void>;
  signInWithRedirect(): Promise<void>;
  signOut(): Promise<void>;
}

const toAuthUser = ({ uid, displayName, email, photoURL }: User): AuthUser => ({ uid, displayName, email, photoURL });

export function createFirebaseAuthClient(): AuthClient {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();

  return {
    async initialize() {
      await setPersistence(auth, browserLocalPersistence);
      await getRedirectResult(auth);
    },
    subscribe(onUser, onError) {
      return onAuthStateChanged(auth, user => onUser(user ? toAuthUser(user) : null), onError);
    },
    async signInWithPopup() {
      await signInWithPopup(auth, provider);
    },
    async signInWithRedirect() {
      await signInWithRedirect(auth, provider);
    },
    async signOut() {
      await signOut(auth);
    },
  };
}

export function shouldUseRedirect(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  standalone: boolean = typeof window !== 'undefined' && (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  ),
): boolean {
  return standalone || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}
