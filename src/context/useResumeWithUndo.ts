import { useReducer, useRef, useCallback } from 'react';
import type { Reducer } from 'react';
import type { ResumeData } from '../types/resume';
import type { ResumeAction } from './resumeReducer';

// ===================== Types =====================

interface UndoableState {
  past: ResumeData[];    // 最多 50 个历史快照
  present: ResumeData;
  future: ResumeData[];  // 重做栈
}

type UndoableAction =
  | { type: 'DISPATCH'; action: ResumeAction; skipHistory?: boolean }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_HISTORY' };

// ===================== Hook =====================

export function useResumeWithUndo(reducer: Reducer<ResumeData, ResumeAction>, initial: ResumeData) {
  const MAX_HISTORY = 50;

  const undoableReducer = useCallback((state: UndoableState, a: UndoableAction): UndoableState => {
    switch (a.type) {
      case 'DISPATCH': {
        const nextPresent = reducer(state.present, a.action);
        if (a.skipHistory) {
          return { ...state, present: nextPresent };
        }
        const newPast = [...state.past, state.present];
        if (newPast.length > MAX_HISTORY) newPast.shift();
        return { past: newPast, present: nextPresent, future: [] };
      }
      case 'UNDO': {
        if (state.past.length === 0) return state;
        const prev = state.past[state.past.length - 1];
        return {
          past: state.past.slice(0, -1),
          present: prev,
          future: [state.present, ...state.future],
        };
      }
      case 'REDO': {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        return {
          past: [...state.past, state.present],
          present: next,
          future: state.future.slice(1),
        };
      }
      case 'CLEAR_HISTORY':
        return { past: [], present: state.present, future: [] };
      default:
        return state;
    }
  }, [reducer]);

  const [undoable, rawDispatch] = useReducer(undoableReducer, {
    past: [],
    present: initial,
    future: [],
  });

  // Refs for stable callback identity
  const undoableRef = useRef(undoable);
  undoableRef.current = undoable;

  const dispatch = useCallback((action: ResumeAction, skipHistory?: boolean) => {
    rawDispatch({ type: 'DISPATCH', action, skipHistory });
  }, []);

  const undo = useCallback(() => rawDispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => rawDispatch({ type: 'REDO' }), []);
  const clearHistory = useCallback(() => rawDispatch({ type: 'CLEAR_HISTORY' }), []);

  return {
    state: undoable.present,
    dispatch,
    undo,
    redo,
    clearHistory,
    canUndo: undoable.past.length > 0,
    canRedo: undoable.future.length > 0,
  };
}
