import type { ResumeData } from '../types/resume';
export interface ExportIssue { message: string; section: 'personalInfo' | 'projects' | 'education' | 'preview' }
export function inspectResumeExport(resume: ResumeData, element?: HTMLElement | null) {
  const issues: ExportIssue[] = [];
  if (!resume.personalInfo.fullName.trim()) issues.push({ message: '尚未填写姓名', section: 'personalInfo' });
  if (!resume.personalInfo.phone.trim() && !resume.personalInfo.email.trim()) issues.push({ message: '尚未填写电话或邮箱', section: 'personalInfo' });
  if (resume.projects.some(p => p.projectName.trim() && !p.description.trim())) issues.push({ message: '部分项目尚未填写经历描述', section: 'projects' });
  if (resume.education.some(e => e.schoolName.trim() && !e.major.trim())) issues.push({ message: '部分教育经历尚未填写专业', section: 'education' });
  const source = element?.querySelector<HTMLElement>('[data-resume-source]');
  if (source && source.scrollWidth > source.clientWidth + 3) issues.push({ message: '检测到内容超出纸张宽度，请检查长链接或排版', section: 'preview' });
  return { pages: element?.querySelectorAll('[data-resume-page]').length || 0, issues };
}
export function smartFitLayout(resume: ResumeData, height: number) {
  const layout = { fontSize: resume.fontSize, lineHeight: resume.lineHeight, pageMargin: resume.pageMargin };
  if (height <= 1133) return layout;
  const ratio = 1123 / height;
  if (layout.pageMargin > 5 && ratio < .95) layout.pageMargin = Math.max(5, layout.pageMargin - 5);
  layout.fontSize = Math.min(layout.fontSize, Math.max(12, Math.round(layout.fontSize * ratio * .95)));
  if (ratio < .85 && layout.lineHeight > 12) layout.lineHeight = Math.max(12, Math.round(layout.lineHeight * ratio));
  return layout;
}
