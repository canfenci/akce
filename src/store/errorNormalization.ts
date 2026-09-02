export type NormalizedErrorKind =
  | 'permission-denied'
  | 'network-unavailable'
  | 'auth-expired'
  | 'sync-conflict'
  | 'unknown';

export interface NormalizedError {
  kind: NormalizedErrorKind;
  userMessage: string;
  originalError?: unknown;
}

export function normalizeError(error: unknown): NormalizedError {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    message.includes('permission-denied') ||
    message.toLowerCase().includes('izin')
  ) {
    return {
      kind: 'permission-denied',
      userMessage: 'Bu işlem için yetkiniz bulunmuyor.',
      originalError: error,
    };
  }

  if (
    code === 'unavailable' ||
    code === 'firestore/unavailable' ||
    code === 'auth/network-request-failed' ||
    message.includes('network-unavailable') ||
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('bağlantı')
  ) {
    return {
      kind: 'network-unavailable',
      userMessage: 'İnternet bağlantısı kurulamadı. Çevrimdışı çalışılıyor.',
      originalError: error,
    };
  }

  if (
    code === 'auth/user-token-expired' ||
    code === 'auth/id-token-expired' ||
    code === 'auth/user-disabled' ||
    message.toLowerCase().includes('token-expired') ||
    message.toLowerCase().includes('oturum süresi')
  ) {
    return {
      kind: 'auth-expired',
      userMessage: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.',
      originalError: error,
    };
  }

  if (message.toLowerCase().includes('çakışma') || message.toLowerCase().includes('conflict')) {
    return {
      kind: 'sync-conflict',
      userMessage: 'Senkronizasyon çakışması tespit edildi. Veriler en güncel duruma eşitlendi.',
      originalError: error,
    };
  }

  return {
    kind: 'unknown',
    userMessage: 'Beklenmedik bir sorun oluştu. Lütfen tekrar deneyin.',
    originalError: error,
  };
}
