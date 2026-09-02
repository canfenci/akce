import { getFirestore, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './firebaseApp';

export type FirestoreCacheMode = 'memory' | 'persistent';
let firestoreInstance: Firestore | null = null;

export function getFirebaseFirestore(cacheMode: FirestoreCacheMode = 'memory') {
  if (firestoreInstance) return firestoreInstance;
  const localCache = cacheMode === 'persistent'
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache();
  const app = getFirebaseApp();
  try {
    firestoreInstance = initializeFirestore(app, { localCache });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code !== 'failed-precondition') throw error;
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}
