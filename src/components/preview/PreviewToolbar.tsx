import { useState } from 'react';
import { useResume } from '../../hooks/useResume';
import { TEMPLATE_LIST } from '../../constants/templates';
import type { FontFamily, PageMargin } from '../../types/resume';

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

const FONT_OPTIONS: { value: FontFamily; label: string; style: string }[] = [
  { value: 'default', label: '默认', style: 'font-sans' },
  { value: 'serif', label: '宋体', style: 'font-serif' },
  { value: 'mono', label: '等宽', style: 'font-mono' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18];
const LINE_HEIGHTS = [1.4, 1.5, 1.6, 1.8, 2.0];
const MARGIN_OPTIONS: { value: PageMargin; label: string; px: string }[] = [
  { value: 'narrow', label: '紧凑', px: '40px' },
  { value: 'normal', label: '标准', px: '60px' },
  { value: 'wide', label: '宽松', px: '80px' },
];

interface PreviewToolbarProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onExport: () => void;
  isExporting: boolean;
  exportError: string | null;
  onSmartFit?: () => void;
}

export default function PreviewToolbar({
  scale,
  onScaleChange,
  onExport,
  isExporting,
  exportError,
  onSmartFit,
}: PreviewToolbarProps) {
  const { resume, setTemplate, setAccentColor, setFontFamily, setFontSize, setLineHeight, setPageMargin, smartSort } = useResume();

  const [showSettings, setShowSettings] = useState(false);

  const zoomOut = () => onScaleChange(Math.max(0.4, scale - 0.1));
  const zoomIn = () => onScaleChange(Math.min(1.5, scale + 0.1));
  const zoomReset = () => onScaleChange(1.1);

  return (
    <div className="bg-white border-b border-gray-200">
      {/* ===== 主工具栏 ===== */}
      <div className="flex items-center justify-between px-5 py-2 gap-3 flex-wrap">
        {/* 左侧：模板 + 主题色 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">模板</span>
          {TEMPLATE_LIST.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setTemplate(tpl.id)}
              className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${
                resume.templateId === tpl.id
                  ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {tpl.name}
            </button>
          ))}

          <span className="w-px h-5 bg-gray-200 mx-1" />

          {ACCENT_PRESETS.map(({ color, name }) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              title={name}
              className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
                resume.accentColor === color ? 'border-gray-700 scale-110' : 'border-gray-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        {/* 中间：智能功能 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSmartFit}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200
                       text-gray-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition-colors"
            title="自动调整字号和页边距，将内容缩放到一页内"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            智能一页
          </button>
          <button
            onClick={smartSort}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200
                       text-gray-500 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
            title="将教育、工作、项目经历按时间从新到旧排序"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19,12 12,19 5,12"/>
            </svg>
            智能排序
          </button>

          {/* 排版设置切换 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              showSettings
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            排版
          </button>
        </div>

        {/* 右侧：缩放 + 导出 */}
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} className="p-0.5 text-gray-400 hover:text-gray-600" title="缩小">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <button onClick={zoomReset} className="text-xs text-gray-500 w-9 text-center hover:text-gray-700">
            {Math.round(scale * 100)}%
          </button>
          <button onClick={zoomIn} className="p-0.5 text-gray-400 hover:text-gray-600" title="放大">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>

          <button onClick={onExport} disabled={isExporting} className="btn-primary text-sm">
            {isExporting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />导出中...</>
            ) : (
              <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>导出 PDF</>
            )}
          </button>
        </div>
      </div>

      {/* ===== 排版设置面板（可折叠） ===== */}
      {showSettings && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* 字体 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">字体</span>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFontFamily(f.value)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${f.style} ${
                  resume.fontFamily === f.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 字号 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">字号</span>
            <select
              value={resume.fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </div>

          {/* 行距 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">行距</span>
            <select
              value={resume.lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {LINE_HEIGHTS.map((h) => (
                <option key={h} value={h}>{h}x</option>
              ))}
            </select>
          </div>

          {/* 页边距 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">页边距</span>
            {MARGIN_OPTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPageMargin(m.value)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  resume.pageMargin === m.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
