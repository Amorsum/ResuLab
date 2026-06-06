import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useResume } from '../hooks/useResume';
import type { TemplateId } from '../types/resume';
import { FormPanel } from '../components/form/FormPanel';
import { PreviewPanel } from '../components/preview/PreviewPanel';

export default function BuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { setTemplate } = useResume();

  // URL 参数中指定模板时切换
  useEffect(() => {
    if (templateId && ['classic', 'modern', 'minimal'].includes(templateId)) {
      setTemplate(templateId as TemplateId);
    }
  }, [templateId, setTemplate]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* 左侧: 表单面板 */}
      <div className="w-[480px] flex-shrink-0">
        <FormPanel />
      </div>

      {/* 右侧: 预览面板 */}
      <div className="flex-1 flex flex-col min-w-0">
        <PreviewPanel />
      </div>
    </div>
  );
}
