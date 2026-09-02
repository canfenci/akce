import { userPath } from './firestorePaths';
import type { FirestoreGateway } from './firestoreGateway';

export interface MigrationMarkerRecordCounts {
  expenses: number;
  incomes: number;
  fixedExpenses: number;
  investments: number;
  categoryBudgets: number;
  assets: number;
  goals: number;
  assetSnapshots: number;
}

export interface MigrationMarker {
  uid: string;
  schemaVersion: 2;
  completedAt: number;
  source: 'local' | 'cloud' | 'merge';
  recordCounts: MigrationMarkerRecordCounts;
}

export function migrationMarkerPath(uid: string): string {
  return `${userPath(uid)}/meta/migration`;
}

export async function readMigrationMarker(gateway: FirestoreGateway, uid: string): Promise<MigrationMarker | null> {
  if (!gateway.getDocument) return null;
  const doc = await gateway.getDocument(migrationMarkerPath(uid));
  if (!doc) return null;
  const data = doc.data;
  if (data.schemaVersion !== 2 || typeof data.uid !== 'string' || typeof data.completedAt !== 'number') {
    return null;
  }
  return {
    uid: data.uid,
    schemaVersion: 2,
    completedAt: data.completedAt,
    source: (data.source as MigrationMarker['source']) || 'local',
    recordCounts: (data.recordCounts as MigrationMarkerRecordCounts) || {
      expenses: 0,
      incomes: 0,
      fixedExpenses: 0,
      investments: 0,
      categoryBudgets: 0,
      assets: 0,
      goals: 0,
      assetSnapshots: 0,
    },
  };
}

export async function writeMigrationMarker(gateway: FirestoreGateway, marker: MigrationMarker): Promise<void> {
  await gateway.setDocument(migrationMarkerPath(marker.uid), {
    ...marker,
    serverTimestamp: gateway.serverTimestamp(),
  });
}
