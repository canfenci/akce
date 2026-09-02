export const firebaseEnvironmentKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

type FirebaseEnvironmentKey = typeof firebaseEnvironmentKeys[number];
export type FirebaseEnvironment = Record<string, unknown>;

export class FirebaseConfigError extends Error {
  constructor(public readonly missingKeys: FirebaseEnvironmentKey[]) {
    super(`Firebase yapılandırması eksik: ${missingKeys.join(', ')}`);
    this.name = 'FirebaseConfigError';
  }
}

export function getFirebaseConfig(environment: FirebaseEnvironment = import.meta.env) {
  const missingKeys = firebaseEnvironmentKeys.filter(key => typeof environment[key] !== 'string' || !environment[key].trim());
  if (missingKeys.length > 0) throw new FirebaseConfigError(missingKeys);

  return {
    apiKey: environment.VITE_FIREBASE_API_KEY as string,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: environment.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: environment.VITE_FIREBASE_APP_ID as string,
  };
}
