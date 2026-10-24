import { createContext, useEffect, useRef, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResumeData } from '../types/resume';
import type { ResumeAction } from './resumeReducer';
import { resumeReducer } from './resumeReducer';
import { useResumeWithUndo } from './useResumeWithUndo';
import { DEFAULT_RESUME } from '../constants/defaultResume';

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
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const loaded = loadFromStorage();
  const {
    state,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useResumeWithUndo(resumeReducer, loaded || DEFAULT_RESUME);

  const value = useMemo(
    () => ({ state, dispatch, undo, redo, canUndo, canRedo, saveStatus }),
    [state, dispatch, undo, redo, canUndo, canRedo, saveStatus]
  );

  // 防抖写入 localStorage
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    };
    timerRef.current = setTimeout(persist, 300);
    const leave = (event: BeforeUnloadEvent) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', persist);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('pagehide', persist);
    };
  }, [state]);

  return (
    <ResumeContext.Provider value={value}>
      {children}
    </ResumeContext.Provider>
  );
}
