import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { aiRequest } from '../utils/aiApi';

// ===================== Types =====================

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updateEmail: (newEmail: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

// ===================== Context =====================

export const AuthContext = createContext<AuthContextValue | null>(null);

// ===================== Provider =====================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取初始 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/builder`,
      },
    });
    if (error) return { error: getChineseErrorMessage(error) };
    // 如果 session 为空，说明需要邮箱验证
    if (!data.session) {
      return { error: null, needsEmailConfirmation: true };
    }
    return { error: null, needsEmailConfirmation: false };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: getChineseErrorMessage(error) };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /** 换绑邮箱 */
  const updateEmail = useCallback(async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return { error: getChineseErrorMessage(error) };
    return { error: null };
  }, []);

  /** 修改密码 */
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: getChineseErrorMessage(error) };
    return { error: null };
  }, []);

  /** 注销账号 */
  const deleteAccount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: '请先登录' };
    try {
      const base = (import.meta.env.VITE_AI_API_BASE ?? 'https://api.amorsum.top').trim().replace(/\/$/, '');
      await aiRequest(base, '/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ confirmation: '确认注销' }) }, '账号注销未完成，请稍后重试');
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '账号注销未完成，请稍后重试' };
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) return { error: getChineseErrorMessage(error) };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword, updateEmail, updatePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

// ===================== Helpers =====================

/** 将 Supabase 英文错误信息转为中文 */
function getChineseErrorMessage(error: AuthError): string {
  const message = error.message || '';
  if (message.includes('Invalid login credentials')) return '邮箱或密码错误';
  if (message.includes('Email not confirmed')) return '邮箱尚未验证，请检查邮箱';
  if (message.includes('User already registered')) return '该邮箱已被注册';
  if (message.includes('Password')) return '密码格式不正确（至少 6 位）';
  if (message.includes('Email')) return '邮箱格式不正确';
  if (message.includes('rate limit')) return '操作过于频繁，请稍后再试';
  return message || '操作失败，请重试';
}
