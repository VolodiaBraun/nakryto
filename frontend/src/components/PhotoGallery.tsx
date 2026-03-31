'use client';

import { useState, useEffect, useCallback } from 'react';

interface PhotoGalleryProps {
  photos: string[];
  onClose: () => void;
  title?: string;
}

export default function PhotoGallery({ photos, onClose, title }: PhotoGalleryProps) {
  const [index, setIndex] = useState(0);

  const prev = useCallback(() => setIndex((i) => (i === 0 ? photos.length - 1 : i - 1)), [photos.length]);
  const next = useCallback(() => setIndex((i) => (i === photos.length - 1 ? 0 : i + 1)), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  // Блокируем скролл body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Шапка */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-gray-300">
          {title && <span className="mr-2">{title} ·</span>}
          {index + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors"
        >
          ×
        </button>
      </div>

      {/* Основное фото */}
      <div
        className="flex-1 flex items-center justify-center px-12 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={photos[index]}
          src={photos[index]}
          alt={`Фото ${index + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          draggable={false}
        />

        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center
                         rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl transition-colors"
            >
              ‹
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center
                         rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl transition-colors"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Миниатюры */}
      {photos.length > 1 && (
        <div
          className="flex gap-2 justify-center px-4 py-3 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((url, i) => (
            <button
              key={url}
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-80'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
