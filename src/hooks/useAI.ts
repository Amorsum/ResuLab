/**
 * AI API 调用 Hook
 * 提供与 Cloudflare Workers 后端通信的方法
 */
import { useAuth } from './useAuth';
import { aiRequest } from '../utils/aiApi';
import type { CareerInput, CareerResult } from '../../shared/career';

const AI_API_BASE = (import.meta.env.VITE_AI_API_BASE ?? 'https://api.amorsum.top').trim().replace(/\/$/, '');

export interface AIGenerateResult {
  personalInfo?: Record<string, string>;
  jobIntention?: Record<string, string>;
  education?: Array<Record<string, unknown>>;
  workExperience?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  certificates?: Array<Record<string, unknown>>;
  languages?: Array<Record<string, unknown>>;
  selfEvaluation?: string;
  socialLinks?: Array<Record<string, unknown>>;
}

export interface InterviewStartResponse {
  question: string;
  round: number;
  evaluation: null;
  isComplete: false;
  finalReport: null;
}

export interface InterviewRespondResponse {
  question: string;
  round: number;
  evaluation: {
    score: number;
    relevance: number;
    structure: number;
    quantification: number;
    expression: number;
    strengths: string;
    weaknesses: string;
    suggestion: string;
  } | null;
  isComplete: boolean;
  finalReport: {
    totalScore: number;
    summary: string;
    dimensions: Array<{ name: string; score: number }>;
    highlights: string[];
    improvements: string[];
  } | null;
}

export function useAI() {
  const { session } = useAuth();

  const headers = () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      h['Authorization'] = `Bearer ${session.access_token}`;
    }
    return h;
  };

  /**
   * 批量生成简历 - 粘贴原始经历文本，返回完整 ResumeData
   */
  const generateResume = async (rawText: string, purpose?: 'resume-import'): Promise<AIGenerateResult> => {
    return aiRequest<AIGenerateResult>(AI_API_BASE, '/api/ai/generate', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ rawText, purpose }),
    }, '生成失败，请重试');
  };

  const tailorResume = (input: CareerInput, signal?: AbortSignal): Promise<CareerResult> =>
    aiRequest<CareerResult>(AI_API_BASE, '/api/ai/tailor', {
      method: 'POST', headers: headers(), body: JSON.stringify(input), signal,
    }, '岗位简历生成失败，请稍后重试');

  const extractLibraryFacts = (rawText: string, signal?: AbortSignal): Promise<AIGenerateResult> =>
    aiRequest<AIGenerateResult>(AI_API_BASE, '/api/ai/generate', {
      method: 'POST', headers: headers(), body: JSON.stringify({ rawText, purpose: 'career-library' }), signal,
    }, '经历提取失败，请稍后重试');

  /** 润色单个字段 */
  const polishField = async (
    fieldLabel: string,
    currentValue: string,
    context: string = ''
  ): Promise<string> => {
    const data = await aiRequest<{ polished: string }>(AI_API_BASE, '/api/ai/polish', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fieldLabel, currentValue, context }),
    }, '润色失败，请重试');
    return data.polished;
  };

  /**
   * 开始模拟面试
   */
  const startInterview = async (resumeData: unknown): Promise<InterviewStartResponse> => {
    return aiRequest<InterviewStartResponse>(AI_API_BASE, '/api/ai/interview/start', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ resumeData }),
    }, '开始面试失败');
  };

  /**
   * 提交面试回答
   */
  const respondToInterview = async (
    resumeData: unknown,
    conversationHistory: string,
    userAnswer: string
  ): Promise<InterviewRespondResponse> => {
    return aiRequest<InterviewRespondResponse>(AI_API_BASE, '/api/ai/interview/respond', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ resumeData, conversationHistory, userAnswer }),
    }, '处理失败，请重试');
  };

  return {
    tailorResume,
    extractLibraryFacts,
    generateResume,
    polishField,
    startInterview,
    respondToInterview,
  };
}
