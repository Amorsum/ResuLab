import type { TemplateId } from '../types/resume';
import { lazy } from 'react';

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  component: React.LazyExoticComponent<React.ComponentType<{ data: import('../types/resume').ResumeData }>>;
  color: string;       // 主题色，用于 UI 展示
  hasPhoto: boolean;   // 是否展示照片
}

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
  classic: {
    id: 'classic',
    name: '经典模板',
    description: '双栏布局，左侧个人信息栏，适合传统行业求职',
    component: lazy(() => import('../templates/classic/ClassicTemplate')),
    color: '#4a5568',
    hasPhoto: true,
  },
  modern: {
    id: 'modern',
    name: '现代模板',
    description: '彩色头部，单栏排版，适合互联网和新兴行业',
    component: lazy(() => import('../templates/modern/ModernTemplate')),
    color: '#4f46e5',
    hasPhoto: true,
  },
  minimal: {
    id: 'minimal',
    name: '极简模板',
    description: '纯文字排版，大量留白，适合设计和创意岗位',
    component: lazy(() => import('../templates/minimal/MinimalTemplate')),
    color: '#374151',
    hasPhoto: false,
  },
  professional: {
    id: 'professional',
    name: '专业模板',
    description: '单栏布局，ATS 解析友好，适合正式求职申请',
    component: lazy(() => import('../templates/professional/ProfessionalTemplate')),
    color: '#1f2937',
    hasPhoto: true,
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);
