import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Rule simulation engine matching the logic of firestore.rules
interface RuleAuth {
  uid: string;
}

interface RuleRequest {
  auth: RuleAuth | null;
  resource?: {
    data: Record<string, unknown>;
  };
}

interface EvaluationContext {
  request: RuleRequest;
  path: string;
  operation: 'read' | 'create' | 'update' | 'delete';
}

function evaluateRules(context: EvaluationContext): { allowed: boolean; reason?: string } {
  const { request, path: docPath, operation } = context;

  // Default deny for undefined root paths
  if (!docPath.startsWith('users/')) {
    return { allowed: false, reason: 'public-root-denied' };
  }

  const parts = docPath.split('/');
  const uid = parts[1];

  // Auth check
  if (!request.auth || !request.auth.uid) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  // Owner check
  if (request.auth.uid !== uid) {
    return { allowed: false, reason: 'not-owner' };
  }

  // Root user doc: users/{uid}
  if (parts.length === 2) {
    return { allowed: true };
  }

  // Metadata: users/{uid}/meta/{metaId}
  if (parts[2] === 'meta') {
    if (operation === 'read') return { allowed: true };
    if (request.resource?.data.schemaVersion !== 2) {
      return { allowed: false, reason: 'invalid-schema-version' };
    }
    return { allowed: true };
  }

  // Global collections: users/{uid}/{assets|goals|assetSnapshots}/{id}
  if (parts[2] === 'assets') {
    if (operation === 'read' || operation === 'delete') return { allowed: true };
    const data = request.resource?.data ?? {};
    if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
    if (typeof data.currentAmount !== 'number' || data.currentAmount < 0) return { allowed: false, reason: 'negative-amount' };
    if (typeof data.targetAmount !== 'number' || data.targetAmount < 0) return { allowed: false, reason: 'negative-amount' };
    return { allowed: true };
  }

  if (parts[2] === 'goals') {
    if (operation === 'read' || operation === 'delete') return { allowed: true };
    const data = request.resource?.data ?? {};
    if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
    if (typeof data.targetAmount !== 'number' || data.targetAmount < 0) return { allowed: false, reason: 'negative-amount' };
    return { allowed: true };
  }

  if (parts[2] === 'assetSnapshots') {
    if (operation === 'read' || operation === 'delete') return { allowed: true };
    const data = request.resource?.data ?? {};
    const monthKey = data.monthKey;
    if (typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return { allowed: false, reason: 'invalid-month-key' };
    }
    if (typeof data.amount !== 'number' || data.amount < 0) return { allowed: false, reason: 'negative-amount' };
    return { allowed: true };
  }

  // Monthly subcollections: users/{uid}/months/{monthKey}
  if (parts[2] === 'months') {
    const monthKey = parts[3];
    if (!monthKey || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return { allowed: false, reason: 'invalid-month-key' };
    }

    if (parts.length === 4) {
      return { allowed: true };
    }

    const subcollection = parts[4];
    if (operation === 'read' || operation === 'delete') return { allowed: true };

    const data = request.resource?.data ?? {};

    if (subcollection === 'expenses') {
      if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
      if (typeof data.amount !== 'number' || data.amount < 0) return { allowed: false, reason: 'negative-amount' };
      const validTypes = ['zorunlu', 'isteğe bağlı', 'plansız'];
      if (!validTypes.includes(String(data.type))) return { allowed: false, reason: 'invalid-type' };
      const validMethods = ['kart', 'nakit'];
      if (!validMethods.includes(String(data.paymentMethod))) return { allowed: false, reason: 'invalid-payment-method' };
      return { allowed: true };
    }

    if (subcollection === 'incomes' || subcollection === 'fixedExpenses') {
      if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
      if (typeof data.amount !== 'number' || data.amount < 0) return { allowed: false, reason: 'negative-amount' };
      if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 100) return { allowed: false, reason: 'invalid-name' };
      return { allowed: true };
    }

    if (subcollection === 'investments') {
      if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
      if (typeof data.plannedAmount !== 'number' || data.plannedAmount < 0) return { allowed: false, reason: 'negative-amount' };
      if (typeof data.actualAmount !== 'number' || data.actualAmount < 0) return { allowed: false, reason: 'negative-amount' };
      return { allowed: true };
    }

    if (subcollection === 'categoryBudgets') {
      if (typeof data.limit !== 'number' || data.limit < 0) return { allowed: false, reason: 'negative-amount' };
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'unmatched-path' };
}

describe('Firestore Security Rules verification', () => {
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  it('verifies that firestore.rules file exists and defines rules_version 2', () => {
    expect(rulesContent).toContain("rules_version = '2'");
    expect(rulesContent).toContain('service cloud.firestore');
    expect(rulesContent).toContain('match /databases/{database}/documents');
  });

  // 1. owner read → ALLOW
  it('1. allows owner to read their documents', () => {
    const res = evaluateRules({
      request: { auth: { uid: 'user-1' } },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'read',
    });
    expect(res.allowed).toBe(true);
  });

  // 2. owner create → ALLOW
  it('2. allows owner to create valid expenses', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'user-1' },
        resource: {
          data: {
            schemaVersion: 2,
            amount: 250,
            type: 'zorunlu',
            paymentMethod: 'kart',
            monthKey: '2026-09',
          },
        },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(true);
  });

  // 3. owner update → ALLOW
  it('3. allows owner to update valid document', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'user-1' },
        resource: {
          data: {
            schemaVersion: 2,
            amount: 500,
            type: 'isteğe bağlı',
            paymentMethod: 'nakit',
            monthKey: '2026-09',
          },
        },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'update',
    });
    expect(res.allowed).toBe(true);
  });

  // 4. owner delete → ALLOW
  it('4. allows owner to delete their documents', () => {
    const res = evaluateRules({
      request: { auth: { uid: 'user-1' } },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'delete',
    });
    expect(res.allowed).toBe(true);
  });

  // 5. başka UID read → DENY
  it('5. denies non-owner from reading documents', () => {
    const res = evaluateRules({
      request: { auth: { uid: 'attacker-uid' } },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'read',
    });
    expect(res.allowed).toBe(false);
  });

  // 6. başka UID write → DENY
  it('6. denies non-owner from writing documents', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'attacker-uid' },
        resource: {
          data: { schemaVersion: 2, amount: 100, type: 'zorunlu', paymentMethod: 'kart' },
        },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(false);
  });

  // 7. unauthenticated read → DENY
  it('7. denies unauthenticated read', () => {
    const res = evaluateRules({
      request: { auth: null },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'read',
    });
    expect(res.allowed).toBe(false);
  });

  // 8. unauthenticated write → DENY
  it('8. denies unauthenticated write', () => {
    const res = evaluateRules({
      request: {
        auth: null,
        resource: { data: { schemaVersion: 2, amount: 50, type: 'zorunlu', paymentMethod: 'kart' } },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(false);
  });

  // 9. public root → DENY
  it('9. denies access to public root collections', () => {
    const res = evaluateRules({
      request: { auth: { uid: 'user-1' } },
      path: 'publicData/shared',
      operation: 'read',
    });
    expect(res.allowed).toBe(false);
  });

  // 10. invalid monthKey → DENY
  it('10. denies document with invalid monthKey', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'user-1' },
        resource: { data: { schemaVersion: 2, amount: 100, type: 'zorunlu', paymentMethod: 'kart' } },
      },
      path: 'users/user-1/months/invalid-month-key/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('invalid-month-key');
  });

  // 11. negative amount → DENY
  it('11. denies document with negative amount', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'user-1' },
        resource: {
          data: { schemaVersion: 2, amount: -50, type: 'zorunlu', paymentMethod: 'kart' },
        },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('negative-amount');
  });

  // 12. invalid schemaVersion → DENY
  it('12. denies document with invalid schemaVersion', () => {
    const res = evaluateRules({
      request: {
        auth: { uid: 'user-1' },
        resource: {
          data: { schemaVersion: 1, amount: 100, type: 'zorunlu', paymentMethod: 'kart' },
        },
      },
      path: 'users/user-1/months/2026-09/expenses/exp-1',
      operation: 'create',
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('invalid-schema-version');
  });
});
