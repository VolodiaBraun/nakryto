/**
 * Сжатие изображения перед загрузкой в S3.
 * - Проверяет лимит размера файла (бросает Error с понятным сообщением)
 * - Масштабирует до maxWidth × maxHeight (сохраняя пропорции)
 * - Конвертирует в WebP с заданным качеством
 */

export const IMAGE_LIMITS = {
  /** Иконки столов */
  ICON: {
    maxSizeBytes: 2 * 1024 * 1024, // 2 MB
    maxWidth: 256,
    maxHeight: 256,
    label: 'иконок столов',
  },
  /** Текстуры пола (глобальная + покрытия) */
  TEXTURE: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    maxWidth: 512,
    maxHeight: 512,
    label: 'текстур пола',
  },
} as const;

/**
 * Проверяет размер файла и сжимает его до WebP.
 * @throws Error если файл превышает лимит
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number,
  maxWidth: number,
  maxHeight: number,
  quality = 0.85,
): Promise<File> {
  // Проверка лимита ДО любой обработки
  if (file.size > maxSizeBytes) {
    const mb = (maxSizeBytes / 1024 / 1024).toFixed(0);
    throw new Error(`Файл слишком большой: максимум ${mb} МБ`);
  }

  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Масштабируем вниз если нужно, сохраняя пропорции
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas недоступен')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Ошибка сжатия изображения')); return; }
          const name = file.name.replace(/\.[^.]+$/, '.webp');
          resolve(new File([blob], name, { type: 'image/webp' }));
        },
        'image/webp',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Не удалось прочитать изображение'));
    };

    img.src = objectUrl;
  });
}

/** Конвертирует dataURL в Blob синхронно (без fetch) */
export function dataURLToBlob(dataURL: string): Blob {
  const [header, data] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/webp';
  const bstr = atob(data);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}
