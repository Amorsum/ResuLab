import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAI, type MembershipStatus } from '../hooks/useAI';

// ===================== Types =====================

interface AIContextValue {
  membership: MembershipStatus | null;
  loading: boolean;
  error: string | null;
  refreshMembership: () => Promise<void>;
  /** 检查某功能是否可用。返回 null 表示可用，返回 string 表示不可用的原因 */
  checkAccess: (feature: 'generate' | 'polish' | 'interview') => string | null;
}

// ===================== Context =====================

export const AIContext = createContext<AIContextValue | null>(null);

// ===================== Provider =====================

export function AIProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { getMembershipStatus } = useAI();
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMembership = useCallback(async () => {
    if (!session?.access_token) {
      setMembership(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await getMembershipStatus();
      setMembership(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取会员信息失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // 登录后自动加载会员状态
  useEffect(() => {
    if (session?.access_token) {
      refreshMembership();
    } else {
      setMembership(null);
    }
  }, [session?.access_token, refreshMembership]);

  const checkAccess = useCallback(
    (feature: 'generate' | 'polish' | 'interview'): string | null => {
      if (!session?.access_token) return '请先登录后再使用 AI 功能';
      if (!membership) return null; // 还在加载，先让通过
      const usage = membership.usage[feature];
      if (usage && usage.used >= usage.limit) {
        if (membership.tier === 'free') {
          return `本月次数已用完，升级 Pro 解锁更多`;
        }
        return `本月次数已达上限`;
      }
      return null;
    },
    [session?.access_token, membership]
  );

  return (
    <AIContext.Provider value={{ membership, loading, error, refreshMembership, checkAccess }}>
      {children}
    </AIContext.Provider>
  );
}
