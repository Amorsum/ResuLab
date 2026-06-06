import { useId } from 'react';

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  hint?: string;
}

export default function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  required,
  hint,
}: TextAreaFieldProps) {
  const id = useId();

  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="input-base resize-y"
      />
      {hint && (
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      )}
    </div>
  );
}
