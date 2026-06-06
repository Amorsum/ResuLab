import { useRef } from 'react';

interface AvatarUploadProps {
  value: string;       // base64 data URL
  onChange: (base64: string) => void;
}

export default function AvatarUpload({ value, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 限制大小 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('照片大小不能超过 2MB');
      return;
    }

    // 读取并压缩
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // 缩小到最大 300x300
        const maxSize = 300;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        onChange(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-2">照片</label>
      <div className="flex items-center gap-4">
        {/* 预览 */}
        <div
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300
                     flex items-center justify-center overflow-hidden cursor-pointer
                     hover:border-primary-400 transition-colors flex-shrink-0"
        >
          {value ? (
            <img src={value} alt="头像" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-gray-300">+</span>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-secondary text-sm"
          >
            {value ? '更换照片' : '上传照片'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="btn-ghost text-sm text-red-500 ml-2"
            >
              移除
            </button>
          )}
          <p className="text-xs text-gray-400 mt-1">支持 JPG/PNG，最大 2MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
