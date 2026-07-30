/**
 * AI API 调用 Hook
 * 提供与 Cloudflare Workers 后端通信的方法
 */
import { useAuth } from './useAuth';

const AI_API_BASE = import.meta.env.VITE_AI_API_BASE || 'https://api.amorsum.top';

export interface MembershipStatus {
  tier: 'free' | 'pro';
  status: 'active' | 'cancelled' | 'expired';
  usage: {
    generate: { used: number; limit: number };
    polish: { used: number; limit: number };
    interview: { used: number; limit: number };
  };
}

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
   * 获取会员状态和用量
   */
  const getMembershipStatus = async (): Promise<MembershipStatus> => {
    const res = await fetch(`${AI_API_BASE}/api/membership/status`, {
      headers: headers(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || '获取会员状态失败');
    }
    return res.json();
  };

  /**
   * 批量生成简历 - 粘贴原始经历文本，返回完整 ResumeData
   */
  const generateResume = async (rawText: string): Promise<AIGenerateResult> => {
    const res = await fetch(`${AI_API_BASE}/api/ai/generate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ rawText }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error((body as { message?: string }).message || '本月使用次数已用完');
      }
      if (res.status === 401) {
        throw new Error('请先登录后再使用');
      }
      throw new Error((body as { message?: string }).message || '生成失败，请重试');
    }

    return res.json();
  };

  /**
   * 润色单个字段 - 返回润色后的文本
   */
  const polishField = async (
    fieldLabel: string,
    currentValue: string,
    context: string = ''
  ): Promise<string> => {
    const res = await fetch(`${AI_API_BASE}/api/ai/polish`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fieldLabel, currentValue, context }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error((body as { message?: string }).message || '本月润色次数已用完');
      }
      if (res.status === 401) {
        throw new Error('请先登录后再使用');
      }
      throw new Error((body as { message?: string }).message || '润色失败，请重试');
    }

    const data = await res.json() as { polished: string };
    return data.polished;
  };

  /**
   * 开始模拟面试
   */
  const startInterview = async (resumeData: unknown): Promise<InterviewStartResponse> => {
    const res = await fetch(`${AI_API_BASE}/api/ai/interview/start`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ resumeData }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error((body as { message?: string }).message || '模拟面试功能需要 Pro 会员');
      }
      if (res.status === 401) {
        throw new Error('请先登录后再使用');
      }
      throw new Error((body as { message?: string }).message || '开始面试失败');
    }

    return res.json();
  };

  /**
   * 提交面试回答
   */
  const respondToInterview = async (
    resumeData: unknown,
    conversationHistory: string,
    userAnswer: string
  ): Promise<InterviewRespondResponse> => {
    const res = await fetch(`${AI_API_BASE}/api/ai/interview/respond`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ resumeData, conversationHistory, userAnswer }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || '处理失败, 请重试');
    }

    return res.json();
  };

  return {
    getMembershipStatus,
    generateResume,
    polishField,
    startInterview,
    respondToInterview,
  };
}
