'use client';

import { useRef, useState } from 'react';

interface PhotoUploaderProps {
  photos: string[];
  maxPhotos: number;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: (url: string) => void;
  label?: string;
}

export default function PhotoUploader({
  photos,
  maxPhotos,
  uploading,
  onUpload,
  onDelete,
  label = 'Фото',
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    onUpload(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">{photos.length}/{maxPhotos}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <div key={url} className="relative group w-20 h-20">
            <img
              src={url}
              alt=""
              className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer"
              onClick={() => setPreview(url)}
            />
            <button
              type="button"
              onClick={() => onDelete(url)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs
                         hidden group-hover:flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              ×
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center
                       justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed text-xs gap-1"
          >
            {uploading ? (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span className="text-2xl leading-none">+</span>
                <span>Фото</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP · макс. 5 МБ</p>

      {/* Лайтбокс для предпросмотра в дашборде */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt=""
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
            onClick={() => setPreview(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
