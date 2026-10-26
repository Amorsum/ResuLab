import { emptyJobs, type JobsWorkspace } from '../../shared/jobs';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open('resulab-jobs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspaces', { keyPath: 'ownerId' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('无法打开求职记录存储'));
  });
}
export async function readJobs(ownerId: string): Promise<JobsWorkspace> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces'), request = tx.objectStore('workspaces').get(ownerId);
    tx.oncomplete = () => { db.close(); resolve(request.result || emptyJobs(ownerId)); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function saveJobs(value: JobsWorkspace): Promise<JobsWorkspace> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readwrite'), store = tx.objectStore('workspaces'), request = store.get(value.ownerId);
    let next: JobsWorkspace; let conflict = false;
    request.onsuccess = () => {
      if ((request.result?.revision || 0) !== value.revision) { conflict = true; tx.abort(); return; }
      next = { ...value, revision: value.revision + 1, updatedAt: Date.now() }; store.put(next);
    };
    tx.oncomplete = () => { db.close(); resolve(next); }; tx.onabort = tx.onerror = () => { db.close(); reject(new Error(conflict ? '其他页面已修改求职记录，请刷新后重试' : '保存失败，请检查浏览器存储空间')); };
  });
}
export async function clearJobs(ownerId: string) {
  const current = await readJobs(ownerId); return saveJobs({ ...emptyJobs(ownerId), revision: current.revision });
}
