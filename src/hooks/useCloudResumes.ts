import { useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useResume } from './useResume';
import { STORAGE_KEY } from '../context/ResumeContext';
import type { ResumeData } from '../types/resume';
import type { CloudResumeMeta } from '../types/resume';
import { identifyResume } from '../utils/resumeDocuments';
import { cleanLibraryResume } from '../utils/careerLibrary';
import { resumeDocumentMetaSchema } from '../../shared/resumeDocument';

// ===================== Cloud CRUD =====================

export function useCloudResumes() {
  const { user } = useAuth();
  const { resume, loadResume, markCloudSaved } = useResume();
  const current = useRef({ resume, userId: user?.id });
  current.current = { resume, userId: user?.id };

  /** 获取当前用户的所有云端简历列表 */
  const listResumes = useCallback(async (): Promise<CloudResumeMeta[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('resumes')
      .select('id, title, created_at, updated_at, documentMeta:data->documentMeta')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error('获取简历列表失败');
    }

    return (data as unknown as CloudResumeMeta[]).map(row => { const meta = resumeDocumentMetaSchema.safeParse(row.documentMeta); return { ...row, documentMeta: meta.success ? meta.data : undefined }; });
  }, [user]);

  /** 保存当前简历到云端（有 _cloudId 则更新，无则新建） */
  const saveResume = useCallback(async (title?: string): Promise<string | null> => {
    if (!user) return null;

    const resumeTitle = title || resume.documentMeta?.title || resume.personalInfo.fullName || '未命名简历';
    // 保存时移除 _cloudId，避免循环嵌套
    const { _cloudId, _cloudUpdatedAt, ...resumeData } = resume;
    const expectedUser = user.id;

    if (resume._cloudId) {
      // 更新已有记录
      if (!_cloudUpdatedAt) throw new Error('缺少云端版本基准，请从“我的简历”核对云端内容后重新打开；本机内容已保留');
      const { data: saved, error } = await supabase
        .from('resumes')
        .update({
          title: resumeTitle,
          data: resumeData as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resume._cloudId).eq('user_id', user.id).eq('updated_at', _cloudUpdatedAt).select('id, updated_at').maybeSingle();

      if (error) {
        throw new Error('保存失败，请重试');
      }
      if (!saved) throw new Error('云端已有新版本，本机内容已保留。请在“我的简历”对照云端，或另存副本后同步');
      if (current.current.userId === expectedUser && resume.documentMeta) markCloudSaved({ documentId: resume.documentMeta.id, cloudId: saved.id, updatedAt: saved.updated_at });

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
        .select('id, updated_at')
        .single();

      if (error) {
        throw new Error('保存失败，请重试');
      }

      // 将云端 ID 写回 state
      // A delayed save must never replace edits made while the request was pending.
      if (current.current.userId === user.id && resume.documentMeta)
        markCloudSaved({ documentId: resume.documentMeta.id, cloudId: data.id, updatedAt: data.updated_at });
      return data.id;
    }
  }, [user, resume, loadResume]);

  const fetchCloudResume = useCallback(async (cloudId: string): Promise<ResumeData> => {
    if (!user) throw new Error('请先登录');
    const expectedUser = user.id;

    const { data, error } = await supabase
      .from('resumes')
      .select('data, title, updated_at')
      .eq('id', cloudId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      throw new Error('加载简历失败');
    }

    if (current.current.userId !== expectedUser) throw new Error('账号已变化，请重新打开');
    const cloudData = identifyResume(cleanLibraryResume(data.data));
    if (!(data.data as ResumeData).documentMeta) cloudData.documentMeta = { id: cloudId, title: data.title, kind: 'unclassified' };
    return { ...cloudData, _cloudId: cloudId, _cloudUpdatedAt: data.updated_at, lastModified: Date.now() };
  }, [user]);
  const loadCloudResume = useCallback(async (cloudId: string) => { await loadResume(await fetchCloudResume(cloudId)); }, [fetchCloudResume, loadResume]);

  /** 删除云端简历 */
  const deleteResume = useCallback(async (cloudId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('resumes')
      .delete()
      .eq('id', cloudId);

    if (error) {
      throw new Error('删除失败，请重试');
    }
  }, [user]);

  return { listResumes, saveResume, loadCloudResume, fetchCloudResume, deleteResume };
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
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** localStorage key — 与 ResumeContext 保持一致 */
export { STORAGE_KEY };
