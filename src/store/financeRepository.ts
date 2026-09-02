import type { AkceData } from './seed';

export interface FinanceRepository {
  loadState(storage?: Pick<Storage, 'getItem'>): AkceData;
  saveState(state: AkceData, storage?: Pick<Storage, 'setItem'>): void;
}
