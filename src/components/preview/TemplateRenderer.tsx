import { Suspense } from 'react';
import { useResume } from '../../hooks/useResume';
import { TEMPLATES } from '../../constants/templates';
import TemplateBase from '../../templates/TemplateBase';

interface TemplateRendererProps {
  previewRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
}

export default function TemplateRenderer({ previewRef, scale }: TemplateRendererProps) {
  const { resume } = useResume();
  const tpl = TEMPLATES[resume.templateId];
  const TemplateComponent = tpl.component;

  return (
    <TemplateBase ref={previewRef} scale={scale}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full min-h-[600px] text-gray-400">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary-300 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">加载模板中...</p>
            </div>
          </div>
        }
      >
        <TemplateComponent data={resume} />
      </Suspense>
    </TemplateBase>
  );
}
