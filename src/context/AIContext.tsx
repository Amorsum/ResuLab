import { createContext, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
interface AIContextValue { checkAccess: (feature: 'generate' | 'polish' | 'interview') => string | null }
export const AIContext = createContext<AIContextValue | null>(null);
export function AIProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const checkAccess = useCallback(() => session?.access_token ? null : '请先登录后再使用 AI 功能', [session?.access_token]);
  const value = useMemo(() => ({ checkAccess }), [checkAccess]);
  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}
