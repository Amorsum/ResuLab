import React, { createContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ResumeData } from '../types/resume';
import type { ResumeAction } from './resumeReducer';
import { resumeReducer } from './resumeReducer';
import { DEFAULT_RESUME } from '../constants/defaultResume';

export const STORAGE_KEY = 'resulab_data';

// ===================== Context =====================

interface ResumeContextValue {
  state: ResumeData;
  dispatch: React.Dispatch<ResumeAction>;
}

export const ResumeContext = createContext<ResumeContextValue | null>(null);

// ===================== Provider =====================

function migrateData(data: ResumeData): ResumeData {
  // 迁移旧版 fontFamily 值
  const validFonts = ['songti', 'yahei', 'kaiti', 'fangsong'];
  if (!validFonts.includes(data.fontFamily as string)) {
    data.fontFamily = 'yahei';
  }
  // 迁移旧版 pageMargin 值为数字
  if (typeof data.pageMargin !== 'number' || isNaN(data.pageMargin)) {
    const marginMap: Record<string, number> = { narrow: 5, normal: 15, wide: 25 };
    data.pageMargin = marginMap[data.pageMargin as unknown as string] || 15;
  }
  // 迁移旧版 lineHeight 小于等于 3 的情况（旧的 unitless 值，如 1.6），转为 px
  if (typeof data.lineHeight === 'number' && data.lineHeight <= 3) {
    data.lineHeight = Math.round(data.lineHeight * 14); // 基于默认 14px 字号转换
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
  const [state, dispatch] = useReducer(resumeReducer, null, () =>
    loadFromStorage() || DEFAULT_RESUME
  );

  // 防抖写入 localStorage
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage 满了
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  return (
    <ResumeContext.Provider value={{ state, dispatch }}>
      {children}
    </ResumeContext.Provider>
  );
}
