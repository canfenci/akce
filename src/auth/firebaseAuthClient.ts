import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
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
  signOut(): Promise<void>;
}

const toAuthUser = ({ uid, displayName, email, photoURL }: User): AuthUser => ({ uid, displayName, email, photoURL });

export function createFirebaseAuthClient(): AuthClient {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();

  return {
    async initialize() {
      await setPersistence(auth, browserLocalPersistence);
    },
    subscribe(onUser, onError) {
      return onAuthStateChanged(auth, user => onUser(user ? toAuthUser(user) : null), onError);
    },
    async signInWithPopup() {
      await signInWithPopup(auth, provider);
    },
    async signOut() {
      await signOut(auth);
    },
  };
}
