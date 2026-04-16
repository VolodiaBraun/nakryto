// ─── Canvas-паттерны для пола ─────────────────────────────────────────────────
// Возвращают HTMLCanvasElement, который Konva использует как fillPatternImage.
// Все функции вызываются только на клиенте (KonvaCanvas и BookingMapKonva
// импортированы с { ssr: false }).

import type { FloorPattern } from '@/types';

export function createPatternCanvas(type: FloorPattern, bgColor?: string): HTMLCanvasElement | null {
  if (type === 'none' || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  switch (type) {
    // ── Паркет ──────────────────────────────────────────────────────────────
    case 'parquet': {
      const base = bgColor ?? '#c8a870';
      canvas.width = 40; canvas.height = 40;
      // фон
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 40, 40);
      // светлый квадрант (горизонтальные планки)
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, 0, 20, 20);
      // тёмный квадрант (вертикальные планки)
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(20, 20, 20, 20);
      // волокна в горизонтальном квадранте
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.5;
      [6, 12, 18].forEach((y) => {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(20, y); ctx.stroke();
      });
      // волокна в вертикальном квадранте
      [26, 32, 38].forEach((x) => {
        ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 40); ctx.stroke();
      });
      // рамки квадрантов
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 19, 19);
      ctx.strokeRect(20.5, 20.5, 19, 19);
      break;
    }

    // ── Плитка ──────────────────────────────────────────────────────────────
    case 'tile': {
      const base = bgColor ?? '#e8e4dc';
      canvas.width = 24; canvas.height = 24;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 24, 24);
      ctx.strokeStyle = 'rgba(140,130,118,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(1, 1, 22, 22);
      // блик
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(3, 3, 8, 4);
      break;
    }

    // ── Камень ──────────────────────────────────────────────────────────────
    case 'stone': {
      const base = bgColor ?? '#a09888';
      canvas.width = 80; canvas.height = 60;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 80, 60);
      ctx.strokeStyle = 'rgba(60,50,40,0.35)';
      ctx.lineWidth = 1.5;
      // форма камней
      const stones: [number, number][][] = [
        [[0,0],[32,0],[36,22],[0,20]],
        [[32,0],[80,0],[80,25],[36,22]],
        [[0,20],[36,22],[40,60],[0,60]],
        [[36,22],[80,25],[80,60],[40,60]],
      ];
      stones.forEach(pts => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.closePath();
        ctx.stroke();
      });
      // разный оттенок
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(32,0); ctx.lineTo(36,22); ctx.lineTo(0,20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.moveTo(32,0); ctx.lineTo(80,0); ctx.lineTo(80,25); ctx.lineTo(36,22); ctx.closePath(); ctx.fill();
      break;
    }

    // ── Бетон ────────────────────────────────────────────────────────────────
    case 'concrete': {
      const base = bgColor ?? '#a8a8a8';
      canvas.width = 60; canvas.height = 60;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 60, 60);
      // очень тонкие горизонтальные строки (как заливка)
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      for (let y = 0; y < 60; y += 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(60, y); ctx.stroke();
      }
      // пятна текстуры
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      [[10,8],[35,20],[20,42],[50,10],[45,50],[5,55]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.ellipse(x, y, 8, 5, 0.3, 0, Math.PI*2); ctx.fill();
      });
      break;
    }

    // ── Ковёр ────────────────────────────────────────────────────────────────
    case 'carpet': {
      const base = bgColor ?? '#7b4a2a';
      canvas.width = 10; canvas.height = 10;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(2, 2, 2, 2);
      ctx.fillRect(7, 7, 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(6, 1, 2, 2);
      ctx.fillRect(1, 6, 2, 2);
      break;
    }
  }

  return canvas;
}

export const PATTERN_OPTIONS: { id: FloorPattern; label: string; preview: string }[] = [
  { id: 'none',     label: 'Без',    preview: '#ffffff' },
  { id: 'parquet',  label: 'Паркет', preview: '#c8a870' },
  { id: 'tile',     label: 'Плитка', preview: '#e8e4dc' },
  { id: 'stone',    label: 'Камень', preview: '#a09888' },
  { id: 'concrete', label: 'Бетон',  preview: '#a8a8a8' },
  { id: 'carpet',   label: 'Ковёр',  preview: '#7b4a2a' },
];
