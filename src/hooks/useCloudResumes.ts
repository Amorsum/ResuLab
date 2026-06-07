import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useResume } from './useResume';
import { STORAGE_KEY } from '../context/ResumeContext';
import type { ResumeData } from '../types/resume';
import type { CloudResumeMeta } from '../types/resume';

// ===================== Cloud CRUD =====================

export function useCloudResumes() {
  const { user } = useAuth();
  const { resume, loadResume } = useResume();

  /** 获取当前用户的所有云端简历列表 */
  const listResumes = useCallback(async (): Promise<CloudResumeMeta[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('resumes')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('获取简历列表失败:', error);
      throw new Error('获取简历列表失败');
    }

    return data as CloudResumeMeta[];
  }, [user]);

  /** 保存当前简历到云端（有 _cloudId 则更新，无则新建） */
  const saveResume = useCallback(async (title?: string): Promise<string | null> => {
    if (!user) return null;

    const resumeTitle = title || resume.personalInfo.fullName || '未命名简历';
    // 保存时移除 _cloudId，避免循环嵌套
    const { _cloudId, ...resumeData } = resume as ResumeData & { _cloudId?: string };

    if (resume._cloudId) {
      // 更新已有记录
      const { error } = await supabase
        .from('resumes')
        .update({
          title: resumeTitle,
          data: resumeData as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resume._cloudId);

      if (error) {
        console.error('更新简历失败:', error);
        throw new Error('保存失败，请重试');
      }

      return resume._cloudId;
    } else {
      // 新建记录
      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          title: resumeTitle,
          data: resumeData as unknown as Record<string, unknown>,
        })
        .select('id')
        .single();

      if (error) {
        console.error('保存简历失败:', error);
        throw new Error('保存失败，请重试');
      }

      // 将云端 ID 写回 state
      loadResume({ ...resume, _cloudId: data.id });
      return data.id;
    }
  }, [user, resume, loadResume]);

  /** 从云端加载指定简历到当前 state */
  const loadCloudResume = useCallback(async (cloudId: string) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('resumes')
      .select('data')
      .eq('id', cloudId)
      .single();

    if (error) {
      console.error('加载简历失败:', error);
      throw new Error('加载简历失败');
    }

    const cloudData = data.data as ResumeData;
    loadResume({ ...cloudData, _cloudId: cloudId, lastModified: Date.now() });
  }, [user, loadResume]);

  /** 删除云端简历 */
  const deleteResume = useCallback(async (cloudId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('resumes')
      .delete()
      .eq('id', cloudId);

    if (error) {
      console.error('删除简历失败:', error);
      throw new Error('删除失败，请重试');
    }
  }, [user]);

  return { listResumes, saveResume, loadCloudResume, deleteResume };
}

// ===================== Local ↔ Cloud Helpers =====================

/** 检查 localStorage 中是否有非空的简历数据 */
export function checkLocalData(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw) as ResumeData;
    // 有姓名或任何经历数据即视为非空
    const hasName = !!data.personalInfo?.fullName;
    const hasEducation = data.education?.length > 0;
    const hasWork = data.workExperience?.length > 0;
    const hasProjects = data.projects?.length > 0;
    const hasSkills = data.skills?.length > 0;

    return hasName || hasEducation || hasWork || hasProjects || hasSkills;
  } catch {
    return false;
  }
}

/** 将 localStorage 中的简历数据导入到云端 */
export async function importLocalResume(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw) as ResumeData;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    const title = data.personalInfo?.fullName || '我的简历';
    const { _cloudId, ...resumeData } = data;

    const { error } = await supabase
      .from('resumes')
      .insert({
        user_id: userId,
        title,
        data: resumeData as unknown as Record<string, unknown>,
      });

    if (error) {
      console.error('导入本地数据失败:', error);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** localStorage key — 与 ResumeContext 保持一致 */
export { STORAGE_KEY };
