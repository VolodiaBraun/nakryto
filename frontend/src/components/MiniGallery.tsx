'use client';

import { useEffect } from 'react';

interface MiniGalleryProps {
  photos: string[];
  title?: string;
  onClose: () => void;
  onOpenPhoto: (index: number) => void;
}

export default function MiniGallery({ photos, title, onClose, onOpenPhoto }: MiniGalleryProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Card */}
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-900 text-sm">
            {title ?? 'Фото'}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Grid */}
        <div className="p-3 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <button
                key={url}
                onClick={() => { onClose(); onOpenPhoto(i); }}
                className="aspect-square rounded-xl overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
              >
                <img
                  src={url}
                  alt={`Фото ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
