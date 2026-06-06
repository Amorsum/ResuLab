import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResume } from '../hooks/useResume';
import type { TemplateId } from '../types/resume';
import { FormPanel } from '../components/form/FormPanel';
import { PreviewPanel } from '../components/preview/PreviewPanel';

export default function BuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { resume, setTemplate } = useResume();
  const navigate = useNavigate();
  const initialized = useRef(false);

  // 首次加载时：URL 有模板参数 → 同步到 state
  useEffect(() => {
    if (!initialized.current && templateId && ['classic', 'modern', 'minimal'].includes(templateId)) {
      setTemplate(templateId as TemplateId);
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // 模板切换时：state 变化 → 同步到 URL
  useEffect(() => {
    if (initialized.current) {
      navigate(`/builder/${resume.templateId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.templateId]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* 左侧: 表单面板 */}
      <div className="w-[440px] flex-shrink-0">
        <FormPanel />
      </div>

      {/* 右侧: 预览面板 */}
      <div className="flex-1 flex flex-col min-w-0">
        <PreviewPanel />
      </div>
    </div>
  );
}
