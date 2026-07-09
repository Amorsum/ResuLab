import { useContext } from 'react';
import { ResumeContext } from '../context/ResumeContext';
import type { ResumeData, ArraySectionName, TemplateId, FontFamily } from '../types/resume';
import { generateId } from '../constants/defaultResume';

export function useResume() {
  const ctx = useContext(ResumeContext);
  if (!ctx) {
    throw new Error('useResume must be used within a ResumeProvider');
  }

  const { state, dispatch, undo, redo, canUndo, canRedo } = ctx;

  return {
    resume: state,

    // ---- 基础信息 ----
    setPersonalInfo: (payload: Partial<ResumeData['personalInfo']>) =>
      dispatch({ type: 'SET_PERSONAL_INFO', payload }),

    setJobIntention: (payload: Partial<ResumeData['jobIntention']>) =>
      dispatch({ type: 'SET_JOB_INTENTION', payload }),

    // ---- 数组操作 ----
    addItem: (section: ArraySectionName) =>
      dispatch({ type: 'ADD_ITEM', section }),

    updateItem: (section: ArraySectionName, id: string, payload: Record<string, unknown>) =>
      dispatch({ type: 'UPDATE_ITEM', section, id, payload }),

    removeItem: (section: ArraySectionName, id: string) =>
      dispatch({ type: 'REMOVE_ITEM', section, id }),

    moveItem: (section: ArraySectionName, fromIndex: number, toIndex: number) =>
      dispatch({ type: 'MOVE_ITEM', section, fromIndex, toIndex }),

    // ---- 其他 ----
    setSelfEvaluation: (payload: string) =>
      dispatch({ type: 'SET_SELF_EVALUATION', payload }),

    setTemplate: (payload: TemplateId) =>
      dispatch({ type: 'SET_TEMPLATE', payload }),

    setAccentColor: (payload: string) =>
      dispatch({ type: 'SET_ACCENT_COLOR', payload }),

    // ---- 排版设置 ----
    setFontFamily: (payload: FontFamily) =>
      dispatch({ type: 'SET_FONT_FAMILY', payload }),

    setFontSize: (payload: number) =>
      dispatch({ type: 'SET_FONT_SIZE', payload }),

    setLineHeight: (payload: number) =>
      dispatch({ type: 'SET_LINE_HEIGHT', payload }),

    setPageMargin: (payload: number) =>
      dispatch({ type: 'SET_PAGE_MARGIN', payload }),

    // ---- 智能功能 ----
    smartSort: () => dispatch({ type: 'SMART_SORT' }),

    loadResume: (payload: ResumeData) =>
      dispatch({ type: 'LOAD_RESUME', payload }, true),

    resetAll: () => dispatch({ type: 'RESET_ALL' }, true),

    // ---- 撤销/重做 ----
    undo,
    redo,
    canUndo,
    canRedo,

    // ---- 工具 ----
    generateId,
  };
}
