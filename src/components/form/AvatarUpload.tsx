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
        // Step 1: 裁剪为 3:4 竖长证件照比例
        const { width: naturalW, height: naturalH } = img;
        const TARGET_RATIO = 3 / 4; // 宽:高

        let cropW: number, cropH: number;
        const imageRatio = naturalW / naturalH;

        if (imageRatio > TARGET_RATIO) {
          // 图片偏宽 → 裁剪左右
          cropH = naturalH;
          cropW = naturalH * TARGET_RATIO;
        } else {
          // 图片偏高 → 裁剪上下
          cropW = naturalW;
          cropH = naturalW / TARGET_RATIO;
        }
        const sx = (naturalW - cropW) / 2;
        const sy = (naturalH - cropH) / 2;

        // Step 2: 缩放到合适大小（最大高度 300px）
        const maxHeight = 300;
        const finalH = Math.min(cropH, maxHeight);
        const finalW = finalH * TARGET_RATIO;

        const canvas = document.createElement('canvas');
        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, sx, sy, cropW, cropH, 0, 0, finalW, finalH);
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
          className="w-[72px] h-[96px] rounded-lg border-2 border-dashed border-gray-300
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
