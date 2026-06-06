import { useContext } from 'react';
import { ResumeContext } from '../context/ResumeContext';
import type { ResumeData, ArraySectionName, TemplateId } from '../types/resume';
import type { ResumeAction } from '../context/resumeReducer';
import { generateId, createEmptyResume } from '../constants/defaultResume';

export function useResume() {
  const ctx = useContext(ResumeContext);
  if (!ctx) {
    throw new Error('useResume must be used within a ResumeProvider');
  }

  const { state, dispatch } = ctx;

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

    loadResume: (payload: ResumeData) =>
      dispatch({ type: 'LOAD_RESUME', payload }),

    resetAll: () => dispatch({ type: 'RESET_ALL' }),

    // ---- 工具 ----
    generateId,
  };
}
