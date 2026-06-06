import { useState, useRef, useEffect } from 'react';
import { useId } from 'react';

interface SkillTagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export default function SkillTagInput({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder = '输入后按回车添加',
}: SkillTagInputProps) {
  const id = useId();
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 过滤建议
  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s)
  ).slice(0, 8);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeTag(values.length - 1);
    }
  };

  // 点击外部关闭建议
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="mb-3" ref={wrapperRef}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {/* 标签列表 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                       text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-primary-400 hover:text-primary-700 transition-colors"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* 输入框 */}
      <input
        id={id}
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="input-base"
      />

      {/* 建议列表 */}
      {showSuggestions && filtered.length > 0 && (
        <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
