import { useState, useEffect, useCallback } from 'react';

const ONBOARDING_KEY = 'resulab_onboarding_done';

interface Step {
  /** 高亮的目标元素选择器 */
  selector: string;
  /** tooltip 标题 */
  title: string;
  /** tooltip 内容 */
  description: string;
  /** tooltip 位置 */
  placement: 'bottom' | 'top' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    selector: '#form-panel',
    title: '📝 填写简历信息',
    description: '在这里填写你的基本信息、教育背景、工作经历等内容，所有修改都会自动保存',
    placement: 'right',
  },
  {
    selector: '#preview-panel',
    title: '👀 实时预览',
    description: '右侧会实时展示你的简历效果，所见即所得',
    placement: 'left',
  },
  {
    selector: '#toolbar-templates',
    title: '🎨 选择模板和样式',
    description: '切换不同模板，调整字体、颜色、页边距，找到最适合你的风格',
    placement: 'bottom',
  },
  {
    selector: '#toolbar-export',
    title: '📄 导出 PDF',
    description: '完成编辑后，一键导出为 A4 格式的 PDF 文件，直接用于求职投递',
    placement: 'bottom',
  },
];

export default function OnboardingOverlay() {
  // 如果已完成引导或不在编辑器页面，不渲染
  if (localStorage.getItem(ONBOARDING_KEY)) return null;

  return <OnboardingContent />;
}

function OnboardingContent() {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const updateTarget = useCallback(() => {
    const sel = STEPS[step]?.selector;
    if (!sel) { setTargetRect(null); return; }
    const el = document.querySelector(sel);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateTarget();
    // 监听 resize，因为移动端可能切换视图
    window.addEventListener('resize', updateTarget);
    return () => window.removeEventListener('resize', updateTarget);
  }, [updateTarget]);

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    // Force re-render by unmounting — the parent check handles this
    window.location.reload();
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  };

  const skip = () => {
    finish();
  };

  const s = STEPS[step];
  if (!s) return null;

  // 计算 tooltip 位置
  const rect = targetRect;
  const tooltipStyle: React.CSSProperties = {};
  const arrowStyle: React.CSSProperties = {};

  if (rect) {
    const gap = 12;
    switch (s.placement) {
      case 'bottom':
        tooltipStyle.top = rect.bottom + gap;
        tooltipStyle.left = rect.left + rect.width / 2;
        tooltipStyle.transform = 'translateX(-50%)';
        arrowStyle.top = -6;
        arrowStyle.left = '50%';
        arrowStyle.transform = 'translateX(-50%)';
        arrowStyle.borderLeft = '6px solid transparent';
        arrowStyle.borderRight = '6px solid transparent';
        arrowStyle.borderBottom = '6px solid white';
        break;
      case 'top':
        tooltipStyle.bottom = window.innerHeight - rect.top + gap;
        tooltipStyle.left = rect.left + rect.width / 2;
        tooltipStyle.transform = 'translateX(-50%)';
        arrowStyle.bottom = -6;
        arrowStyle.left = '50%';
        arrowStyle.transform = 'translateX(-50%)';
        arrowStyle.borderLeft = '6px solid transparent';
        arrowStyle.borderRight = '6px solid transparent';
        arrowStyle.borderTop = '6px solid white';
        break;
      case 'right':
        tooltipStyle.top = rect.top + rect.height / 2;
        tooltipStyle.left = rect.right + gap;
        tooltipStyle.transform = 'translateY(-50%)';
        arrowStyle.left = -6;
        arrowStyle.top = '50%';
        arrowStyle.transform = 'translateY(-50%)';
        arrowStyle.borderTop = '6px solid transparent';
        arrowStyle.borderBottom = '6px solid transparent';
        arrowStyle.borderRight = '6px solid white';
        break;
      case 'left':
        tooltipStyle.top = rect.top + rect.height / 2;
        tooltipStyle.right = window.innerWidth - rect.left + gap;
        tooltipStyle.transform = 'translateY(-50%)';
        arrowStyle.right = -6;
        arrowStyle.top = '50%';
        arrowStyle.transform = 'translateY(-50%)';
        arrowStyle.borderTop = '6px solid transparent';
        arrowStyle.borderBottom = '6px solid transparent';
        arrowStyle.borderLeft = '6px solid white';
        break;
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 高亮的目标区域（镂空） */}
      {rect && (
        <div
          className="absolute bg-white ring-4 ring-primary-400 rounded-lg"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            zIndex: 1,
          }}
        />
      )}

      {/* Tooltip */}
      {rect && (
        <div
          className="absolute bg-white rounded-xl shadow-2xl p-5 max-w-xs z-10"
          style={tooltipStyle}
        >
          {/* 箭头 */}
          <div className="absolute w-0 h-0" style={arrowStyle} />

          <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
          <p className="text-sm text-gray-500 mb-4">{s.description}</p>

          <div className="flex items-center justify-between">
            <button
              onClick={skip}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              跳过引导
            </button>
            <div className="flex items-center gap-2">
              {/* 步骤指示器 */}
              <span className="text-xs text-gray-400">
                {step + 1} / {STEPS.length}
              </span>
              <button
                onClick={next}
                className="px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
              >
                {step < STEPS.length - 1 ? '下一步' : '开始制作'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
