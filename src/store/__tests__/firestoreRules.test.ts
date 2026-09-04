import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { seedData } from '../seed';
import { toFirestoreDto } from '../firestoreFinanceMappers';

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
  operation: 'read' | 'list' | 'create' | 'update' | 'delete';
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
    if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
    const monthKey = data.monthKey;
    if (typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return { allowed: false, reason: 'invalid-month-key' };
    }
    if (typeof data.amount !== 'number' || data.amount < 0) return { allowed: false, reason: 'negative-amount' };
    return { allowed: true };
  }

  // Market rates: users/{uid}/marketRates/current
  if (parts[2] === 'marketRates' && parts[3] === 'current') {
    if (operation === 'read' || operation === 'delete') return { allowed: true };
    const data = request.resource?.data ?? {};
    if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
    const validRateKeys = ['USD_TRY', 'EUR_TRY', 'GOLD_GRAM_TRY', 'SILVER_GRAM_TRY', 'QUARTER_GOLD_TRY', 'REPUBLIC_GOLD_TRY', 'GOLD_22K_GRAM_TRY'];
    for (const key of Object.keys(data)) {
      if (key === 'schemaVersion' || key === 'deviceId' || key === 'updatedAt' || key === 'createdAt' || key === 'serverUpdatedAt') continue;
      if (!validRateKeys.includes(key)) return { allowed: false, reason: 'invalid-rate-key' };
      if (typeof data[key] !== 'number' || data[key] < 0) return { allowed: false, reason: 'negative-amount' };
    }
    return { allowed: true };
  }

  // Monthly subcollections: users/{uid}/months/{monthKey}
  if (parts[2] === 'months') {
    if (parts.length === 3 && operation === 'list') {
      return { allowed: true };
    }

    const monthKey = parts[3];

    if (parts.length === 4) {
      if (operation === 'read' || operation === 'delete') {
        return { allowed: true };
      }
      if (!monthKey || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
        return { allowed: false, reason: 'invalid-month-key' };
      }
      if (request.resource?.data?.schemaVersion !== 2) {
        return { allowed: false, reason: 'invalid-schema-version' };
      }
      return { allowed: true };
    }

    const subcollection = parts[4];
    if (operation === 'read' || operation === 'delete') return { allowed: true };

    if (!monthKey || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return { allowed: false, reason: 'invalid-month-key' };
    }

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
      if (data.schemaVersion !== 2) return { allowed: false, reason: 'invalid-schema-version' };
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

  it('allows the owner to list month documents without weakening month write validation', () => {
    const monthRuleStart = rulesContent.indexOf('match /months/{monthKey}');
    const expenseRuleStart = rulesContent.indexOf('match /expenses/{expenseId}', monthRuleStart);
    const monthDocumentRule = rulesContent.slice(monthRuleStart, expenseRuleStart);

    // Regression: the former combined read/write rule depended on monthKey and
    // Firestore rejected the entire users/{uid}/months collection query.
    expect(monthDocumentRule).toContain('allow read: if isOwner(uid);');
    expect(monthDocumentRule).not.toContain('allow read, write:');
    expect(evaluateRules({
      request: { auth: { uid: 'user-1' } },
      path: 'users/user-1/months',
      operation: 'list',
    }).allowed).toBe(true);
    expect(evaluateRules({
      request: { auth: { uid: 'attacker-uid' } },
      path: 'users/user-1/months',
      operation: 'list',
    }).allowed).toBe(false);
    expect(evaluateRules({
      request: { auth: { uid: 'user-1' }, resource: { data: { schemaVersion: 2 } } },
      path: 'users/user-1/months/not-a-month',
      operation: 'create',
    }).allowed).toBe(false);
  });

  // Task 7: Specifically reproduces authenticated owner LIST/query of /users/{uid}/months on empty db
  it('AKÇE-017B: specifically allows authenticated owner to perform LIST/query of /users/{uid}/months when database is empty', () => {
    // 1. In security rules: allow read on match /months/{monthKey} must only require isOwner(uid)
    // without requiring validMonthKey(monthKey) on read.
    const monthRuleMatch = rulesContent.match(/match \/months\/\{monthKey\}[\s\S]*?(?=match \/expenses)/);
    expect(monthRuleMatch).not.toBeNull();
    const monthRuleBlock = monthRuleMatch![0];
    const readRuleLine = monthRuleBlock.split('\n').find(line => line.includes('allow read:'));
    expect(readRuleLine).toBeDefined();
    expect(readRuleLine!.trim()).toBe('allow read: if isOwner(uid);');
    expect(readRuleLine).not.toContain('validMonthKey');

    // 2. Evaluator check: LIST operation on users/{uid}/months is allowed for the owner
    const res = evaluateRules({
      request: { auth: { uid: 'owner-uid' } },
      path: 'users/owner-uid/months',
      operation: 'list',
    });
    expect(res.allowed).toBe(true);
  });

  // Task 8: Verification of month security & subcollection isolation
  describe('AKÇE-017B: Month and subcollection security validations', () => {
    it('denies invalid month document writes (invalid monthKey format)', () => {
      const invalidKeys = ['not-a-month', '2026-13', '2026-00', '2026-9', '202609'];
      for (const invalidKey of invalidKeys) {
        const res = evaluateRules({
          request: {
            auth: { uid: 'user-1' },
            resource: { data: { schemaVersion: 2, monthKey: invalidKey } },
          },
          path: `users/user-1/months/${invalidKey}`,
          operation: 'create',
        });
        expect(res.allowed, `Expected write to monthKey "${invalidKey}" to be denied`).toBe(false);
        expect(res.reason).toBe('invalid-month-key');
      }
    });

    it('denies month document writes with invalid schemaVersion', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: { data: { schemaVersion: 1, monthKey: '2026-09' } },
        },
        path: 'users/user-1/months/2026-09',
        operation: 'create',
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('invalid-schema-version');
    });

    it('denies another UID from reading or listing months', () => {
      // Attacker cannot list months
      const listRes = evaluateRules({
        request: { auth: { uid: 'attacker-uid' } },
        path: 'users/user-1/months',
        operation: 'list',
      });
      expect(listRes.allowed).toBe(false);
      expect(listRes.reason).toBe('not-owner');

      // Attacker cannot read a specific month
      const readRes = evaluateRules({
        request: { auth: { uid: 'attacker-uid' } },
        path: 'users/user-1/months/2026-09',
        operation: 'read',
      });
      expect(readRes.allowed).toBe(false);
      expect(readRes.reason).toBe('not-owner');

      // Unauthenticated cannot list or read months
      expect(evaluateRules({
        request: { auth: null },
        path: 'users/user-1/months',
        operation: 'list',
      }).allowed).toBe(false);

      expect(evaluateRules({
        request: { auth: null },
        path: 'users/user-1/months/2026-09',
        operation: 'read',
      }).allowed).toBe(false);
    });

    it('allows valid owner month writes with valid monthKey and schemaVersion 2', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: { data: { monthKey: '2026-09', schemaVersion: 2, deviceId: 'device-1' } },
        },
        path: 'users/user-1/months/2026-09',
        operation: 'create',
      });
      expect(res.allowed).toBe(true);
    });

    it('preserves existing subcollection security for all monthly data types', () => {
      const validSubcollections = [
        { name: 'expenses', data: { schemaVersion: 2, amount: 150, type: 'zorunlu', paymentMethod: 'kart', monthKey: '2026-09' } },
        { name: 'incomes', data: { schemaVersion: 2, amount: 2000, name: 'Maaş', monthKey: '2026-09' } },
        { name: 'fixedExpenses', data: { schemaVersion: 2, amount: 500, name: 'Kira', monthKey: '2026-09' } },
        { name: 'investments', data: { schemaVersion: 2, plannedAmount: 1000, actualAmount: 1000, monthKey: '2026-09' } },
        { name: 'categoryBudgets', data: { schemaVersion: 2, limit: 1200, monthKey: '2026-09' } },
      ];

      for (const item of validSubcollections) {
        const itemPath = `users/user-1/months/2026-09/${item.name}/item-1`;

        // Valid owner write allowed
        expect(evaluateRules({
          request: { auth: { uid: 'user-1' }, resource: { data: item.data } },
          path: itemPath,
          operation: 'create',
        }).allowed).toBe(true);

        // Attacker write denied
        expect(evaluateRules({
          request: { auth: { uid: 'attacker-uid' }, resource: { data: item.data } },
          path: itemPath,
          operation: 'create',
        }).allowed).toBe(false);

        // Invalid monthKey in path denied
        expect(evaluateRules({
          request: { auth: { uid: 'user-1' }, resource: { data: item.data } },
          path: `users/user-1/months/bad-key/${item.name}/item-1`,
          operation: 'create',
        }).allowed).toBe(false);

        // Invalid schemaVersion denied
        expect(evaluateRules({
          request: { auth: { uid: 'user-1' }, resource: { data: { ...item.data, schemaVersion: 1 } } },
          path: itemPath,
          operation: 'create',
        }).allowed).toBe(false);
      }
    });
  });

  it('accepts every first-migration DTO shape and rejects undefined fields', () => {
    const timestamp = { kind: 'server-timestamp' };
    const monthKey = seedData.selectedMonthKey;
    const dtoCases = [
      ['users/user-1/assets/asset-1', toFirestoreDto(seedData.assets[0], 'device-1', timestamp)],
      ['users/user-1/goals/goal-1', toFirestoreDto(seedData.goals[0], 'device-1', timestamp)],
      ['users/user-1/assetSnapshots/snapshot-1', toFirestoreDto({ id: 'snapshot-1', assetId: 'asset-1', monthKey, amount: 100, createdAt: 1 }, 'device-1', timestamp)],
      [`users/user-1/months/${monthKey}/expenses/expense-1`, toFirestoreDto(seedData.expenses[0], 'device-1', timestamp)],
      [`users/user-1/months/${monthKey}/incomes/income-1`, toFirestoreDto(seedData.incomes[0], 'device-1', timestamp)],
      [`users/user-1/months/${monthKey}/fixedExpenses/fixed-1`, toFirestoreDto(seedData.fixedExpenses[0], 'device-1', timestamp)],
      [`users/user-1/months/${monthKey}/investments/inv-2`, toFirestoreDto(seedData.investments[1], 'device-1', timestamp)],
      [`users/user-1/months/${monthKey}/categoryBudgets/cat-1`, toFirestoreDto(seedData.categoryBudgets[0], 'device-1', timestamp)],
    ] as const;

    for (const [documentPath, data] of dtoCases) {
      expect(Object.values(data)).not.toContain(undefined);
      expect(evaluateRules({
        request: { auth: { uid: 'user-1' }, resource: { data } },
        path: documentPath,
        operation: 'create',
      }), documentPath).toMatchObject({ allowed: true });
    }

    const directWrites = [
      [`users/user-1/months/${monthKey}`, { monthKey, schemaVersion: 2, deviceId: 'device-1' }],
      ['users/user-1/meta/migration', { uid: 'user-1', schemaVersion: 2, completedAt: 1, source: 'local', recordCounts: {} }],
    ] as const;
    for (const [documentPath, data] of directWrites) {
      expect(evaluateRules({
        request: { auth: { uid: 'user-1' }, resource: { data } },
        path: documentPath,
        operation: 'create',
      }), documentPath).toMatchObject({ allowed: true });
    }
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

  // Public root → DENY
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

  describe('AKÇE-038: market rates rules', () => {
    it('allows owner to read market rates', () => {
      const res = evaluateRules({
        request: { auth: { uid: 'user-1' } },
        path: 'users/user-1/marketRates/current',
        operation: 'read',
      });
      expect(res.allowed).toBe(true);
    });

    it('allows owner to write valid market rates', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: {
            data: { schemaVersion: 2, USD_TRY: 38.5, GOLD_GRAM_TRY: 3200 },
          },
        },
        path: 'users/user-1/marketRates/current',
        operation: 'create',
      });
      expect(res.allowed).toBe(true);
    });

    it('allows owner to delete market rates', () => {
      const res = evaluateRules({
        request: { auth: { uid: 'user-1' } },
        path: 'users/user-1/marketRates/current',
        operation: 'delete',
      });
      expect(res.allowed).toBe(true);
    });

    it('denies non-owner from reading market rates', () => {
      const res = evaluateRules({
        request: { auth: { uid: 'attacker-uid' } },
        path: 'users/user-1/marketRates/current',
        operation: 'read',
      });
      expect(res.allowed).toBe(false);
    });

    it('denies unauthenticated read of market rates', () => {
      const res = evaluateRules({
        request: { auth: null },
        path: 'users/user-1/marketRates/current',
        operation: 'read',
      });
      expect(res.allowed).toBe(false);
    });

    it('denies market rates with invalid schemaVersion', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: {
            data: { schemaVersion: 1, USD_TRY: 38.5 },
          },
        },
        path: 'users/user-1/marketRates/current',
        operation: 'create',
      });
      expect(res.allowed).toBe(false);
    });

    it('denies market rates with negative values', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: {
            data: { schemaVersion: 2, USD_TRY: -5 },
          },
        },
        path: 'users/user-1/marketRates/current',
        operation: 'create',
      });
      expect(res.allowed).toBe(false);
    });

    it('allows market rates with only schemaVersion (empty rates)', () => {
      const res = evaluateRules({
        request: {
          auth: { uid: 'user-1' },
          resource: {
            data: { schemaVersion: 2 },
          },
        },
        path: 'users/user-1/marketRates/current',
        operation: 'create',
      });
      expect(res.allowed).toBe(true);
    });
  });
});
