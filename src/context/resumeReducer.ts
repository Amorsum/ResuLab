import type { ResumeData, ArraySectionName, TemplateId, FontFamily } from '../types/resume';
import { generateId, createEmptyResume } from '../constants/defaultResume';
import { applyAIImport, type AIImportPlan } from '../utils/aiImport';
import { applyAgentChanges, type AgentApplication } from '../utils/agentChanges';
import { applyCareerApplication } from '../utils/careerApplication';
import type { CareerApplicationPlan } from '../../shared/careerEntries';

// ===================== Action 类型 =====================

export type ResumeAction =
  | { type: 'ACK_CLOUD'; payload: { documentId: string; cloudId: string; updatedAt: string } }
  | { type: 'SET_DOCUMENT_META'; payload: NonNullable<ResumeData['documentMeta']> }
  | { type: 'SET_LAYOUT'; payload: Pick<ResumeData, 'fontSize' | 'lineHeight' | 'pageMargin'> }
  | { type: 'APPLY_CAREER'; payload: CareerApplicationPlan }
  | { type: 'APPLY_AGENT_CHANGES'; payload: AgentApplication }
  | { type: 'IMPORT_AI_RESUME'; payload: AIImportPlan }
  | { type: 'SET_PERSONAL_INFO'; payload: Partial<ResumeData['personalInfo']> }
  | { type: 'SET_JOB_INTENTION'; payload: Partial<ResumeData['jobIntention']> }
  | { type: 'ADD_ITEM'; section: ArraySectionName }
  | { type: 'UPDATE_ITEM'; section: ArraySectionName; id: string; payload: Record<string, unknown> }
  | { type: 'REMOVE_ITEM'; section: ArraySectionName; id: string }
  | { type: 'MOVE_ITEM'; section: ArraySectionName; fromIndex: number; toIndex: number }
  | { type: 'SET_SELF_EVALUATION'; payload: string }
  | { type: 'SET_TEMPLATE'; payload: TemplateId }
  | { type: 'SET_ACCENT_COLOR'; payload: string }
  | { type: 'SET_FONT_FAMILY'; payload: FontFamily }
  | { type: 'SET_FONT_SIZE'; payload: number }
  | { type: 'SET_LINE_HEIGHT'; payload: number }
  | { type: 'SET_PAGE_MARGIN'; payload: number }
  | { type: 'SMART_SORT' }
  | { type: 'LOAD_RESUME'; payload: ResumeData }
  | { type: 'RESET_ALL' };

// ===================== 空条目工厂 =====================

function createEmptyItem(section: ArraySectionName) {
  const id = generateId();
  switch (section) {
    case 'education':
      return { id, schoolName: '', degree: '本科' as const, major: '', startDate: '', endDate: '', isCurrent: false, gpa: '', description: '' };
    case 'workExperience':
      return { id, companyName: '', position: '', startDate: '', endDate: '', isCurrent: false, city: '', description: '', highlights: [] };
    case 'projects':
      return { id, projectName: '', role: '', startDate: '', endDate: '', isCurrent: false, description: '', techStack: [], url: '' };
    case 'skills':
      return { id, skillName: '', level: '熟练' as const, category: '' };
    case 'certificates':
      return { id, name: '', issuer: '', date: '' };
    case 'languages':
      return { id, language: '', level: '良好' as const, score: '' };
    case 'socialLinks':
      return { id, platform: '', url: '' };
  }
}

// ===================== Reducer =====================

export function resumeReducer(state: ResumeData, action: ResumeAction): ResumeData {
  switch (action.type) {
    case 'ACK_CLOUD': return state.documentMeta?.id === action.payload.documentId ? { ...state, _cloudId: action.payload.cloudId, _cloudUpdatedAt: action.payload.updatedAt } : state;
    case 'SET_DOCUMENT_META': return { ...state, documentMeta: action.payload, lastModified: Date.now() };
    case 'SET_LAYOUT': return Object.entries(action.payload).every(([key, value]) => state[key as keyof ResumeData] === value) ? state : { ...state, ...action.payload, lastModified: Date.now() };
    case 'APPLY_CAREER':
      return applyCareerApplication(state, action.payload);
    case 'APPLY_AGENT_CHANGES':
      return applyAgentChanges(state, action.payload);
    case 'IMPORT_AI_RESUME':
      return applyAIImport(state, action.payload);
    case 'SET_PERSONAL_INFO':
      return {
        ...state,
        lastModified: Date.now(),
        personalInfo: { ...state.personalInfo, ...action.payload },
      };

    case 'SET_JOB_INTENTION':
      return {
        ...state,
        lastModified: Date.now(),
        jobIntention: { ...state.jobIntention, ...action.payload },
      };

    case 'ADD_ITEM':
      return {
        ...state,
        lastModified: Date.now(),
        [action.section]: [...state[action.section], createEmptyItem(action.section)],
      };

    case 'UPDATE_ITEM': {
      const arr = state[action.section];
      return {
        ...state,
        lastModified: Date.now(),
        [action.section]: arr.map((item: { id: string }) =>
          item.id === action.id ? { ...item, ...action.payload } : item
        ),
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        lastModified: Date.now(),
        [action.section]: state[action.section].filter((item: { id: string }) => item.id !== action.id),
      };

    case 'MOVE_ITEM': {
      const list = [...state[action.section]];
      const [moved] = list.splice(action.fromIndex, 1);
      list.splice(action.toIndex, 0, moved);
      return {
        ...state,
        lastModified: Date.now(),
        [action.section]: list,
      };
    }

    case 'SET_SELF_EVALUATION':
      return {
        ...state,
        lastModified: Date.now(),
        selfEvaluation: action.payload,
      };

    case 'SET_TEMPLATE':
      if (state.templateId === action.payload) return state;
      return {
        ...state,
        lastModified: Date.now(),
        templateId: action.payload,
      };

    case 'SET_ACCENT_COLOR':
      return {
        ...state,
        lastModified: Date.now(),
        accentColor: action.payload,
      };

    case 'SET_FONT_FAMILY':
      return { ...state, lastModified: Date.now(), fontFamily: action.payload };

    case 'SET_FONT_SIZE':
      return { ...state, lastModified: Date.now(), fontSize: action.payload };

    case 'SET_LINE_HEIGHT':
      return { ...state, lastModified: Date.now(), lineHeight: action.payload };

    case 'SET_PAGE_MARGIN':
      return { ...state, lastModified: Date.now(), pageMargin: action.payload };

    case 'SMART_SORT': {
      const sortByDate = <T extends { startDate: string; isCurrent: boolean }>(items: T[]): T[] => {
        return [...items].sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return 1;
          if (!a.isCurrent && b.isCurrent) return -1;
          return (a.startDate || '').localeCompare(b.startDate || '');
        });
      };
      return {
        ...state,
        lastModified: Date.now(),
        education: sortByDate(state.education),
        workExperience: sortByDate(state.workExperience),
        projects: sortByDate(state.projects),
      };
    }

    case 'LOAD_RESUME':
      return action.payload;

    case 'RESET_ALL':
      return { ...createEmptyResume(), documentMeta: state.documentMeta, _cloudId: state._cloudId };

    default:
      return state;
  }
}
