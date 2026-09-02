import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import { getFirebaseFirestore, type FirestoreCacheMode } from '../firebase/firebaseFirestore';

export interface GatewayDocument {
  id: string;
  data: Record<string, unknown>;
}

export type GatewayBatchOperation =
  | { type: 'set'; path: string; data: Record<string, unknown>; merge?: boolean }
  | { type: 'update'; path: string; data: Record<string, unknown> }
  | { type: 'delete'; path: string };

export interface FirestoreGateway {
  subscribeCollection(path: string, onDocuments: (documents: GatewayDocument[]) => void, onError: (error: unknown) => void): () => void;
  getDocument?(path: string): Promise<GatewayDocument | null>;
  getDocuments?(path: string): Promise<GatewayDocument[]>;
  setDocument(path: string, data: Record<string, unknown>, merge?: boolean): Promise<void>;
  updateDocument(path: string, data: Record<string, unknown>): Promise<void>;
  deleteDocument(path: string): Promise<void>;
  commitBatch(operations: GatewayBatchOperation[]): Promise<void>;
  serverTimestamp(): unknown;
}

export function createFirestoreGateway(cacheMode: FirestoreCacheMode = 'memory'): FirestoreGateway {
  const firestore = getFirebaseFirestore(cacheMode);
  return {
    subscribeCollection(path, onDocuments, onError) {
      return onSnapshot(collection(firestore, path), snapshot => onDocuments(snapshot.docs.map(item => ({ id: item.id, data: item.data() }))), onError);
    },
    async getDocument(path) {
      const snapshot = await getDoc(doc(firestore, path));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, data: snapshot.data() as Record<string, unknown> };
    },
    async getDocuments(path) {
      const snapshot = await getDocs(collection(firestore, path));
      return snapshot.docs.map(item => ({ id: item.id, data: item.data() as Record<string, unknown> }));
    },
    async setDocument(path, data, merge = false) {
      await setDoc(doc(firestore, path), data as DocumentData, { merge });
    },
    async updateDocument(path, data) {
      await updateDoc(doc(firestore, path), data);
    },
    async deleteDocument(path) {
      await deleteDoc(doc(firestore, path));
    },
    async commitBatch(operations) {
      const batch = writeBatch(firestore);
      for (const operation of operations) {
        const reference = doc(firestore, operation.path);
        if (operation.type === 'set') batch.set(reference, operation.data, { merge: operation.merge ?? false });
        else if (operation.type === 'update') batch.update(reference, operation.data);
        else batch.delete(reference);
      }
      await batch.commit();
    },
    serverTimestamp,
  };
}
