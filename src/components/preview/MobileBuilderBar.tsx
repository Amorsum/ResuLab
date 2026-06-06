import { useState } from 'react';
import { useResume } from '../../hooks/useResume';
import type { FontFamily } from '../../types/resume';

interface MobileBuilderBarProps {
  view: 'form' | 'preview';
  onSwitchView: (v: 'form' | 'preview') => void;
  onExport: () => void;
  isExporting: boolean;
  onSmartFit?: () => void;
}

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'songti', label: '宋体' },
  { value: 'yahei', label: '雅黑' },
  { value: 'kaiti', label: '楷体' },
  { value: 'fangsong', label: '仿宋' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18];
const LINE_HEIGHTS = [12, 14, 16, 18, 20, 22, 24, 26, 28];

function marginLabel(m: number) {
  const labels: Record<number, string> = { 5: '很窄', 10: '偏窄', 15: '标准', 20: '偏宽', 25: '很宽' };
  return labels[m] || `${m}`;
}

export default function MobileBuilderBar({ view, onSwitchView, onExport, isExporting, onSmartFit }: MobileBuilderBarProps) {
  const { resume, setFontFamily, setFontSize, setLineHeight, setPageMargin, smartSort } = useResume();
  const [showSettings, setShowSettings] = useState(false);

  if (view === 'form') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 py-3 pb-safe">
        <button
          onClick={() => onSwitchView('preview')}
          className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium text-sm active:bg-primary-700 transition-colors"
        >
          👁️ 预览简历
        </button>
      </div>
    );
  }

  // Preview mode
  return (
    <>
      {/* 排版设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setShowSettings(false)}>
          <div
            className="w-full bg-white rounded-t-2xl px-5 py-5 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">排版设置</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 p-1">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* 字体 */}
            <div className="mb-4">
              <span className="text-xs text-gray-400 mb-1.5 block">字体</span>
              <div className="flex gap-2 flex-wrap">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFontFamily(f.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      resume.fontFamily === f.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 字号 + 行距 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-xs text-gray-400 mb-1.5 block">字号</span>
                <select
                  value={resume.fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>{s}px</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-xs text-gray-400 mb-1.5 block">行距</span>
                <select
                  value={resume.lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                >
                  {LINE_HEIGHTS.map((h) => (
                    <option key={h} value={h}>{h}px</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 页边距 */}
            <div className="mb-2">
              <span className="text-xs text-gray-400 mb-1.5 block">页边距</span>
              <div className="flex gap-2">
                {[5, 10, 15, 20, 25].map((m) => (
                  <button
                    key={m}
                    onClick={() => setPageMargin(m)}
                    className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                      resume.pageMargin === m
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {marginLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-safe">
        <div className="flex items-center justify-between px-3 py-2">
          {/* 返回编辑 */}
          <button
            onClick={() => onSwitchView('form')}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-gray-500 active:bg-gray-100 rounded-lg transition-colors min-w-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
            <span className="text-[10px] leading-none">编辑</span>
          </button>

          {/* 智能功能 */}
          <button
            onClick={onSmartFit}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-gray-500 active:bg-amber-50 active:text-amber-600 rounded-lg transition-colors min-w-0"
            title="智能一页"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <span className="text-[10px] leading-none">智能一页</span>
          </button>

          <button
            onClick={smartSort}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-gray-500 active:bg-blue-50 active:text-blue-600 rounded-lg transition-colors min-w-0"
            title="智能排序"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19,12 12,19 5,12"/>
            </svg>
            <span className="text-[10px] leading-none">排序</span>
          </button>

          {/* 排版 */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-gray-500 active:bg-gray-100 rounded-lg transition-colors min-w-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span className="text-[10px] leading-none">排版</span>
          </button>

          {/* 导出 */}
          <button
            onClick={onExport}
            disabled={isExporting}
            className="flex flex-col items-center gap-0.5 px-3 py-1 bg-primary-600 text-white rounded-lg active:bg-primary-700 transition-colors min-w-0 disabled:opacity-50"
          >
            {isExporting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            <span className="text-[10px] leading-none">{isExporting ? '导出中' : '导出'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
