import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import type { ResumeData } from '../types/resume';
import { formatDateRange } from './dateFormat';

/**
 * 导出简历为 Word (.docx) 格式
 * 仅支持 Web 端。Tauri 桌面端走原生保存（复用 pdfExport 的 Tauri invoke 模式）
 */
export async function exportToDocx(data: ResumeData, filename: string) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;

  const children: Paragraph[] = [];

  // ===== 个人信息 =====
  if (p.fullName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: p.fullName, bold: true, size: 36 })],
        spacing: { after: 80 },
      })
    );
  }

  // 联系方式
  const contactParts: string[] = [];
  if (p.phone) contactParts.push(p.phone);
  if (p.email) contactParts.push(p.email);
  if (p.city) contactParts.push(p.city);
  if (p.gender) contactParts.push(p.gender);
  if (p.birthYear) contactParts.push(`${p.birthYear}年${p.birthMonth}月`);
  if (j.desiredPosition) contactParts.push(`求职意向: ${j.desiredPosition}`);
  if (p.yearsOfExperience) contactParts.push(`${p.yearsOfExperience}年经验`);

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contactParts.join(' | '), size: 20, color: '666666' })],
        spacing: { after: 60 },
      })
    );
  }

  // 求职意向详情
  const intentionParts: string[] = [];
  if (j.desiredCity) intentionParts.push(`意向城市: ${j.desiredCity}`);
  if (j.expectedSalary) intentionParts.push(`期望薪资: ${j.expectedSalary}`);
  if (j.jobType) intentionParts.push(`工作类型: ${j.jobType}`);
  if (intentionParts.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: intentionParts.join(' · '), size: 20, color: '666666' })],
        spacing: { after: 120 },
      })
    );
  }

  // ===== 每一节的工具函数 =====
  const headingRun = (text: string) => new TextRun({ text, bold: true, size: 24, color: '1f2937' });

  // ===== 自我评价 =====
  if (selfEvaluation) {
    children.push(new Paragraph({ children: [headingRun('自我评价')], spacing: { before: 160, after: 80 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: selfEvaluation, size: 21 })], spacing: { after: 120 } }));
  }

  // ===== 工作经历 =====
  if (workExperience.length > 0) {
    children.push(new Paragraph({ children: [headingRun('工作经验')], spacing: { before: 160, after: 80 } }));
    for (const exp of workExperience) {
      const dateStr = formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${exp.companyName}  ${exp.position}`, bold: true, size: 22 }),
            new TextRun({ text: `    ${dateStr}`, size: 18, color: '888888' }),
          ],
          spacing: { after: 40 },
        })
      );
      if (exp.city) {
        children.push(new Paragraph({ children: [new TextRun({ text: exp.city, size: 18, color: '888888' })], spacing: { after: 40 } }));
      }
      if (exp.description) {
        children.push(new Paragraph({ children: [new TextRun({ text: exp.description, size: 21 })], spacing: { after: 40 } }));
      }
      for (const h of exp.highlights) {
        children.push(new Paragraph({ children: [new TextRun({ text: `• ${h}`, size: 21 })], spacing: { after: 20 } }));
      }
      children.push(new Paragraph({ spacing: { after: 80 } }));
    }
  }

  // ===== 项目经历 =====
  if (projects.length > 0) {
    children.push(new Paragraph({ children: [headingRun('项目经历')], spacing: { before: 160, after: 80 } }));
    for (const proj of projects) {
      const dateStr = formatDateRange(proj.startDate, proj.endDate, proj.isCurrent);
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${proj.projectName}  ${proj.role || ''}`, bold: true, size: 22 }),
            new TextRun({ text: `    ${dateStr}`, size: 18, color: '888888' }),
          ],
          spacing: { after: 40 },
        })
      );
      if (proj.description) {
        children.push(new Paragraph({ children: [new TextRun({ text: proj.description, size: 21 })], spacing: { after: 40 } }));
      }
      if (proj.techStack.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: `技术栈: ${proj.techStack.join(' · ')}`, size: 18, color: '888888' })], spacing: { after: 40 } }));
      }
      children.push(new Paragraph({ spacing: { after: 80 } }));
    }
  }

  // ===== 教育背景 =====
  if (education.length > 0) {
    children.push(new Paragraph({ children: [headingRun('教育背景')], spacing: { before: 160, after: 80 } }));
    for (const edu of education) {
      const dateStr = formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);
      const info = [edu.degree, edu.major, edu.gpa ? `GPA ${edu.gpa}` : ''].filter(Boolean).join(' · ');
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${edu.schoolName}`, bold: true, size: 22 }),
            new TextRun({ text: `    ${dateStr}`, size: 18, color: '888888' }),
          ],
          spacing: { after: 40 },
        })
      );
      if (info) {
        children.push(new Paragraph({ children: [new TextRun({ text: info, size: 20, color: '555555' })], spacing: { after: 40 } }));
      }
      children.push(new Paragraph({ spacing: { after: 60 } }));
    }
  }

  // ===== 技能 =====
  if (skills.length > 0) {
    children.push(new Paragraph({ children: [headingRun('技能特长')], spacing: { before: 160, after: 80 } }));
    // 按类别分组
    const groups = skills.reduce<Record<string, typeof skills>>((acc, s) => {
      const cat = s.category || '其他';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {});
    for (const [cat, items] of Object.entries(groups)) {
      const label = Object.keys(groups).length > 1 ? `${cat}: ` : '';
      const text = label + items.map(s => `${s.skillName}(${s.level})`).join(' · ');
      children.push(new Paragraph({ children: [new TextRun({ text, size: 21 })], spacing: { after: 40 } }));
    }
  }

  // ===== 证书 + 语言 =====
  if (certificates.length > 0 || languages.length > 0) {
    children.push(new Paragraph({ children: [headingRun('证书 & 语言')], spacing: { before: 160, after: 80 } }));
    for (const c of certificates) {
      const text = [c.name, c.issuer, c.date].filter(Boolean).join(' — ');
      children.push(new Paragraph({ children: [new TextRun({ text, size: 21 })], spacing: { after: 20 } }));
    }
    for (const l of languages) {
      const text = `${l.language}: ${l.level}${l.score ? ` (${l.score})` : ''}`;
      children.push(new Paragraph({ children: [new TextRun({ text, size: 21 })], spacing: { after: 20 } }));
    }
  }

  // ===== 社交链接 =====
  if (socialLinks.length > 0) {
    children.push(new Paragraph({ children: [headingRun('社交链接')], spacing: { before: 160, after: 80 } }));
    for (const sl of socialLinks) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${sl.platform}: ${sl.url}`, size: 20, color: '555555' })], spacing: { after: 20 } }));
    }
  }

  // ===== 生成文档 =====
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2cm
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);

  // 检查是否 Tauri 环境
  const win = window as unknown as Record<string, unknown>;
  const isTauri = !!(win['__TAURI__'] || win['__TAURI_INTERNALS__']);

  if (isTauri) {
    const tauri = win['__TAURI__'] as Record<string, unknown> | undefined;
    const core = tauri?.core as Record<string, unknown> | undefined;
    if (core && typeof core.invoke === 'function') {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
      });
      reader.readAsDataURL(blob);
      const base64 = await base64Promise;
      (core.invoke as (cmd: string, args: Record<string, unknown>) => Promise<unknown>)('save_pdf', { data: base64, filename: `${filename}.docx` });
      return;
    }
  }

  // Web 环境 或 Tauri 回退
  saveAs(blob, `${filename}.docx`);
}
