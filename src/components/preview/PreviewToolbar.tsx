import { useResume } from '../../hooks/useResume';
import { TEMPLATE_LIST } from '../../constants/templates';

// 预设主题色
const ACCENT_PRESETS = [
  { color: '#2563eb', name: '蓝色' },
  { color: '#4f46e5', name: '靛蓝' },
  { color: '#059669', name: '翠绿' },
  { color: '#d97706', name: '琥珀' },
  { color: '#dc2626', name: '红色' },
  { color: '#7c3aed', name: '紫色' },
  { color: '#0891b2', name: '青色' },
  { color: '#4a5568', name: '灰蓝' },
  { color: '#1f2937', name: '墨黑' },
];

interface PreviewToolbarProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onExport: () => void;
  isExporting: boolean;
  exportError: string | null;
}

export default function PreviewToolbar({
  scale,
  onScaleChange,
  onExport,
  isExporting,
  exportError,
}: PreviewToolbarProps) {
  const { resume, setTemplate, setAccentColor } = useResume();

  const zoomOut = () => onScaleChange(Math.max(0.4, scale - 0.1));
  const zoomIn = () => onScaleChange(Math.min(1.5, scale + 0.1));
  const zoomReset = () => onScaleChange(0.8);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-2.5 bg-white border-b border-gray-200">
      {/* 左侧：模板切换 */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">模板：</span>
        <div className="flex gap-1">
          {TEMPLATE_LIST.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setTemplate(tpl.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                resume.templateId === tpl.id
                  ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tpl.name}
            </button>
          ))}
        </div>

        {/* 分隔 */}
        <span className="w-px h-5 bg-gray-200 mx-1" />

        {/* 主题色选择 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 font-medium">主题色：</span>
          <div className="flex gap-0.5">
            {ACCENT_PRESETS.map(({ color, name }) => (
              <button
                key={color}
                onClick={() => setAccentColor(color)}
                title={name}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                  resume.accentColor === color ? 'border-gray-800 scale-110' : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 右侧：缩放 + 导出 */}
      <div className="flex items-center gap-2">
        {/* 缩放 */}
        <div className="flex items-center gap-1 mr-2">
          <button onClick={zoomOut} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="缩小">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <button
            onClick={zoomReset}
            className="text-xs text-gray-500 min-w-[48px] text-center hover:text-gray-700 transition-colors"
          >
            {Math.round(scale * 100)}%
          </button>
          <button onClick={zoomIn} className="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="放大">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
        </div>

        {/* 导出 */}
        <button
          onClick={onExport}
          disabled={isExporting}
          className="btn-primary text-sm"
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              导出中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              导出 PDF
            </>
          )}
        </button>
      </div>

      {exportError && (
        <div className="absolute top-full right-0 mt-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
          {exportError}
        </div>
      )}
    </div>
  );
}
