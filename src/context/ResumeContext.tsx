import { createContext, useEffect, useRef, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResumeData } from '../types/resume';
import type { ResumeAction } from './resumeReducer';
import { resumeReducer } from './resumeReducer';
import { useResumeWithUndo } from './useResumeWithUndo';
import { DEFAULT_RESUME } from '../constants/defaultResume';
import { useAuth } from '../hooks/useAuth';
import { identifyResume, forkResume, persistResumeDocument, readResumeDocuments, ResumeDocumentConflictError } from '../utils/resumeDocuments';

export const STORAGE_KEY = 'resulab_data';

// ===================== Context =====================

interface ResumeContextValue {
  state: ResumeData;
  dispatch: (action: ResumeAction, skipHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'saving' | 'saved' | 'error';
  saveError: 'conflict' | 'storage' | null;
  retrySave: () => Promise<void>;
  switchResume: (resume: ResumeData) => Promise<void>;
  persistCurrent: () => Promise<void>;
  acceptDocumentRevision: (id: string, revision: number) => void;
  saveCurrentCopy: (title: string) => Promise<void>;
}

export const ResumeContext = createContext<ResumeContextValue | null>(null);

// ===================== Provider =====================

function migrateData(data: ResumeData): ResumeData {
  const validFonts = ['songti', 'yahei', 'kaiti', 'fangsong'];
  if (!validFonts.includes(data.fontFamily as string)) {
    data.fontFamily = 'yahei';
  }
  if (typeof data.pageMargin !== 'number' || isNaN(data.pageMargin)) {
    const marginMap: Record<string, number> = { narrow: 5, normal: 15, wide: 25 };
    data.pageMargin = marginMap[data.pageMargin as unknown as string] || 15;
  }
  if (typeof data.lineHeight === 'number' && data.lineHeight <= 3) {
    data.lineHeight = Math.round(data.lineHeight * 14);
  }
  return data;
}

function loadFromStorage(): ResumeData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as ResumeData;
      if (data && typeof data.templateId === 'string') {
        return migrateData(data);
      }
    }
  } catch {
    // 数据损坏，忽略
  }
  return null;
}

export function ResumeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.id || 'local-guest';
  const [stateOwner, setStateOwner] = useState(() => { try { return localStorage.getItem('resulab.current-owner') || 'legacy'; } catch { return 'legacy'; } });
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [saveError, setSaveError] = useState<'conflict' | 'storage' | null>(null);
  const reportSaveError = (error: unknown) => { setSaveError(error instanceof ResumeDocumentConflictError ? 'conflict' : 'storage'); setSaveStatus('error'); };
  const [loaded] = useState(() => identifyResume(loadFromStorage() || DEFAULT_RESUME));
  const {
    state,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useResumeWithUndo(resumeReducer, loaded);

  const live = useRef({ state, stateOwner }); live.current = { state, stateOwner };
  const revisions = useRef(new Map<string, number>()), io = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveLocalRecovery = (snapshot: ResumeData, owner: string, revision: number) => {
    const value = JSON.stringify({ format: 'resulab-current-v1', resume: snapshot, revision });
    try { sessionStorage.setItem(`resulab.current:${owner}`, value); } catch { /* localStorage remains the fallback */ }
    localStorage.setItem(`resulab.current:${owner}`, value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  };
  const acceptDocumentRevision = (id: string, revision: number) => { revisions.current.set(`${live.current.stateOwner}:${id}`, revision); };
  const write = (snapshot: ResumeData, owner: string, checkpoint?: string) => {
    const work = io.current.catch(() => {}).then(async () => {
      const id = snapshot.documentMeta!.id, key = `${owner}:${id}`;
      const saved = await persistResumeDocument(owner, snapshot, revisions.current.get(key) ?? 0, checkpoint);
      revisions.current.set(key, saved.revision);
      if (live.current.stateOwner === owner && live.current.state === snapshot) { saveLocalRecovery(snapshot, owner, saved.revision); localStorage.setItem('resulab.current-owner', owner); }
    });
    io.current = work; return work;
  };
  const persistCurrent = async () => { clearTimeout(timerRef.current); const current = live.current; await write(current.state, current.stateOwner, '切换前的简历'); };
  const retrySave = async () => {
    clearTimeout(timerRef.current); const current = live.current; setSaveStatus('saving');
    try {
      saveLocalRecovery(current.state, current.stateOwner, revisions.current.get(`${current.stateOwner}:${current.state.documentMeta!.id}`) ?? 0);
      await write(current.state, current.stateOwner);
      if (live.current.state === current.state && live.current.stateOwner === current.stateOwner) { setSaveError(null); setSaveStatus('saved'); }
    } catch (error) { if (live.current.state === current.state && live.current.stateOwner === current.stateOwner) reportSaveError(error); }
  };
  const saveCurrentCopy = async (title: string) => {
    clearTimeout(timerRef.current); const current = live.current, next = forkResume(current.state, title, 'unclassified');
    await io.current.catch(() => {}); const saved = await persistResumeDocument(current.stateOwner, next, 0);
    if (live.current.stateOwner !== current.stateOwner || live.current.state !== current.state) throw new Error('副本已保存，当前稿又有新修改，请从“我的简历”打开副本');
    revisions.current.set(`${current.stateOwner}:${saved.id}`, saved.revision);
    dispatch({ type: 'LOAD_RESUME', payload: next }, true);
  };
  const switchResume = async (value: ResumeData) => {
    const before = live.current.state, owner = live.current.stateOwner;
    await persistCurrent();
    if (live.current.stateOwner !== owner || live.current.state !== before) throw new Error('当前稿或账号在切换前发生变化，请重新打开；新修改仍保留');
    const next = identifyResume(value);
    const stored = (await readResumeDocuments(owner)).find(r => r.id === next.documentMeta!.id);
    revisions.current.set(`${owner}:${next.documentMeta!.id}`, stored?.revision || 0);
    await write(next, owner, '打开前的简历');
    if (live.current.stateOwner !== owner || live.current.state !== before) throw new Error('简历已保存，但当前稿有新修改，请重新打开目标简历');
    dispatch({ type: 'LOAD_RESUME', payload: next }, true);
  };

  useEffect(() => {
    if (authLoading) return;
    let disposed = false;
    const prepare = async () => {
      const current = live.current;
      if (current.stateOwner !== 'legacy' && current.stateOwner !== ownerId) await write(current.state, current.stateOwner, '切换账号前');
      let tabRecovery: string | null = null;
      try { tabRecovery = sessionStorage.getItem(`resulab.current:${ownerId}`); } catch { /* use shared storage */ }
      const raw = tabRecovery || localStorage.getItem(`resulab.current:${ownerId}`);
      const saved = raw ? JSON.parse(raw) : null;
      const envelope = saved?.format === 'resulab-current-v1' && saved.resume ? saved : null;
      let next = identifyResume(raw ? migrateData(envelope ? envelope.resume : saved) : current.stateOwner === 'legacy' ? current.state : structuredClone(DEFAULT_RESUME));
      const stored = (await readResumeDocuments(ownerId)).find(r => r.id === next.documentMeta!.id);
      const legacyBaseline = localStorage.getItem(`resulab.current-revision:${ownerId}:${next.documentMeta!.id}`);
      const hasBaseline = Boolean(envelope && Number.isSafeInteger(envelope.revision) && envelope.revision >= 0) || legacyBaseline !== null;
      const baseline = envelope && Number.isSafeInteger(envelope.revision) ? Number(envelope.revision) : Number(legacyBaseline);
      const contentChanged = stored && JSON.stringify({ ...next, lastModified: 0 }) !== JSON.stringify({ ...stored.resume, lastModified: 0 });
      const recovery = Boolean(stored && contentChanged && (next.lastModified > stored.resume.lastModified || envelope && baseline < stored.revision));
      if (stored && !recovery) next = stored.resume;
      if (disposed) return;
      revisions.current.set(`${ownerId}:${next.documentMeta!.id}`, recovery && hasBaseline ? baseline : stored?.revision || 0);
      dispatch({ type: 'LOAD_RESUME', payload: next }, true); setStateOwner(ownerId); localStorage.setItem('resulab.current-owner', ownerId);
    };
    void prepare().catch((error) => { if (!disposed) { if (live.current.stateOwner !== 'legacy' && live.current.stateOwner !== ownerId) dispatch({ type: 'LOAD_RESUME', payload: identifyResume(structuredClone(DEFAULT_RESUME)) }, true); reportSaveError(error); setStateOwner(ownerId); } });
    return () => { disposed = true; };
  }, [ownerId, authLoading]);

  const value = useMemo(
    () => ({ state, dispatch, undo, redo, canUndo, canRedo, saveStatus, saveError, retrySave, switchResume, persistCurrent, acceptDocumentRevision, saveCurrentCopy }),
    [state, dispatch, undo, redo, canUndo, canRedo, saveStatus, saveError]
  );

  // 防抖写入 localStorage
  useEffect(() => {
    if (authLoading || stateOwner !== ownerId) return;
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    const persist = () => {
      try {
        saveLocalRecovery(state, stateOwner, revisions.current.get(`${stateOwner}:${state.documentMeta!.id}`) ?? 0);
        void write(state, stateOwner).then(() => { if (live.current.state === state && live.current.stateOwner === stateOwner) { setSaveError(null); setSaveStatus('saved'); } }).catch((error) => { if (live.current.state === state && live.current.stateOwner === stateOwner) reportSaveError(error); });
      } catch (error) {
        if (live.current.state === state && live.current.stateOwner === stateOwner) reportSaveError(error);
      }
    };
    timerRef.current = setTimeout(persist, 300);
    const leave = (event: BeforeUnloadEvent) => {
      try { saveLocalRecovery(state, stateOwner, revisions.current.get(`${stateOwner}:${state.documentMeta!.id}`) ?? 0); }
      catch { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', persist);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('pagehide', persist);
    };
  }, [state, stateOwner, ownerId, authLoading]);

  return (
    <ResumeContext.Provider value={value}>
      {authLoading || stateOwner !== ownerId ? <p role="status" className="p-6">正在读取当前账号的简历…</p> : children}
    </ResumeContext.Provider>
  );
}
