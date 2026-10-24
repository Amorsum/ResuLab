import type { ExecutionBatch, ExecutionStore, LedgerEntry } from './engine';
export async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open('resulab-extension', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('values'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function get<T>(key: string): Promise<T | undefined> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('values'), request = tx.objectStore('values').get(key);
    tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function put(key: string, value: unknown): Promise<void> {
  const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction('values', 'readwrite');
    tx.objectStore('values').put(value, key); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function clearPrefix(prefix: string) {
  const db = await database(); return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('values', 'readwrite'), store = tx.objectStore('values'), cursor = store.openCursor();
    cursor.onsuccess = () => { const value = cursor.result; if (value) { if (String(value.key).startsWith(prefix)) value.delete(); value.continue(); } };
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export function executionStore(ownerId: string, batchId?: string): ExecutionStore {
  const prefix = `owner:${ownerId}:`;
  return {
    load: () => get<ExecutionBatch>(prefix + (batchId ? 'batch:' + batchId : 'batch')),
    save: async batch => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('values', 'readwrite'), store = tx.objectStore('values');
        store.put(batch, prefix + 'batch'); store.put(batch, prefix + 'batch:' + batch.manifest.id);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
      });
    },
    pdf: hash => get<Uint8Array>(prefix + 'pdf:' + hash), ledger: async () => await get<LedgerEntry[]>(prefix + 'ledger') || [],
    remember: async entry => { const entries = await get<LedgerEntry[]>(prefix + 'ledger') || [];
      await put(prefix + 'ledger', [...entries.filter(e => !(e.account === entry.account && e.jobId === entry.jobId)), entry]); },
  };
}
