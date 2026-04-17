'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Ellipse, Text, Group, Image as KonvaImage } from 'react-konva';
import { createPatternCanvas } from '@/lib/floorPatterns';
import type { Hall, FloorPlan, TableObject, DecorativeObject, FloorObject } from '@/types';
import Konva from 'konva';
import { TABLE_TAGS } from '@/lib/tableTags';

interface BookingMapKonvaProps {
  hall: Hall;
  tableStatuses: Record<string, 'FREE' | 'BOOKED' | 'LOCKED'>;
  tableFreeUntil: Record<string, string | null>;
  selectedTableId: string | null;
  guestCount: number;
  onTableSelect: (tableId: string) => void;
  darkMode?: boolean;
}

const STATUS_COLORS_LIGHT = {
  FREE:     { fill: '#dcfce7', stroke: '#4ade80', text: '#166534' },
  BOOKED:   { fill: '#fee2e2', stroke: '#f87171', text: '#991b1b' },
  LOCKED:   { fill: '#fef3c7', stroke: '#fbbf24', text: '#92400e' },
  SELECTED: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af' },
  DISABLED: { fill: '#f3f4f6', stroke: '#d1d5db', text: '#9ca3af' },
};

const STATUS_COLORS_DARK = {
  FREE:     { fill: '#14532d', stroke: '#4ade80', text: '#86efac' },
  BOOKED:   { fill: '#450a0a', stroke: '#f87171', text: '#fca5a5' },
  LOCKED:   { fill: '#451a03', stroke: '#fbbf24', text: '#fde68a' },
  SELECTED: { fill: '#1e3a5f', stroke: '#60a5fa', text: '#93c5fd' },
  DISABLED: { fill: '#27272a', stroke: '#3f3f46', text: '#71717a' },
};

const DECOR_COLORS_LIGHT: Record<string, { fill: string; stroke: string }> = {
  wall:     { fill: '#94a3b8', stroke: '#64748b' },
  column:   { fill: '#d1d5db', stroke: '#9ca3af' },
  bar:      { fill: '#fcd34d', stroke: '#f59e0b' },
  entrance: { fill: '#fef9c3', stroke: '#eab308' },
  toilet:   { fill: '#f3e8ff', stroke: '#c084fc' },
  stairs:   { fill: '#e0f2fe', stroke: '#38bdf8' },
  stage:    { fill: '#fce7f3', stroke: '#f472b6' },
  window:   { fill: '#bfdbfe', stroke: '#93c5fd' },
  chair:    { fill: '#e7ddd0', stroke: '#a68b6e' },
};

const DECOR_COLORS_DARK: Record<string, { fill: string; stroke: string }> = {
  wall:     { fill: '#334155', stroke: '#475569' },
  column:   { fill: '#3f3f46', stroke: '#52525b' },
  bar:      { fill: '#78350f', stroke: '#f59e0b' },
  entrance: { fill: '#422006', stroke: '#eab308' },
  toilet:   { fill: '#3b0764', stroke: '#c084fc' },
  stairs:   { fill: '#0c4a6e', stroke: '#38bdf8' },
  stage:    { fill: '#500724', stroke: '#f472b6' },
  window:   { fill: '#1e3a5f', stroke: '#60a5fa' },
  chair:    { fill: '#3d2e20', stroke: '#7a5c3e' },
};

// Склонение: 1 место / 2-4 места / 5+ мест
function seatsLabel(min: number, max: number): string {
  const n = max;
  const l2 = n % 100, l1 = n % 10;
  const form = (l2 >= 11 && l2 <= 14) ? 'мест'
    : l1 === 1 ? 'место'
    : (l1 >= 2 && l1 <= 4) ? 'места'
    : 'мест';
  return `${min}–${max} ${form}`;
}

function formatHHMM(isoStr: string) {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getTableColor(
  table: TableObject,
  status: 'FREE' | 'BOOKED' | 'LOCKED' | undefined,
  isSelected: boolean,
  guestCount: number,
  tagFilter: string | null,
  darkMode: boolean,
  themeTableStyle?: { fill: string; stroke: string; text: string },
) {
  const C = darkMode ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  if (isSelected) return C.SELECTED;
  if (status === 'BOOKED' || status === 'LOCKED') return C[status];
  if (guestCount > table.maxGuests || guestCount < table.minGuests) return C.DISABLED;
  if (tagFilter && !(table.tags ?? []).includes(tagFilter)) return C.DISABLED;
  // FREE — применяем тему если есть
  if (themeTableStyle) return themeTableStyle;
  return C.FREE;
}

// ─── Зум-кнопки ───────────────────────────────────────────────────────────────

function ZoomControls({ scale, onZoomIn, onZoomOut, onReset, darkMode }: {
  scale: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; darkMode?: boolean;
}) {
  const btn = darkMode
    ? 'w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-200 hover:bg-zinc-700 font-medium shadow-sm text-sm'
    : 'w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium shadow-sm text-sm';
  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
      <button className={btn} onClick={onZoomIn} title="Увеличить">+</button>
      <button className={btn} onClick={onReset} title="По размеру" style={{ fontSize: 10 }}>{Math.round(scale * 100)}%</button>
      <button className={btn} onClick={onZoomOut} title="Уменьшить">−</button>
    </div>
  );
}

export default function BookingMapKonva({
  hall, tableStatuses, tableFreeUntil, selectedTableId, guestCount, onTableSelect, darkMode = false,
}: BookingMapKonvaProps) {
  const fp = hall.floorPlan || { width: 800, height: 600, objects: [] };
  const DECOR_COLORS = darkMode ? DECOR_COLORS_DARK : DECOR_COLORS_LIGHT;
  const bgColor = fp.theme?.bgColor ?? (darkMode ? '#1c1c1e' : 'white');
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const didInit = useRef(false);
  const didDrag = useRef(false);

  const [tagFilter, setTagFilter]     = useState<string | null>(null);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [tooltip, setTooltip]         = useState<{ x: number; y: number; text: string } | null>(null);
  const [iconImages, setIconImages]     = useState<Record<string, HTMLImageElement>>({});
  const [floorImages, setFloorImages]   = useState<Record<string, HTMLImageElement>>({});
  const [chairImages, setChairImages]   = useState<Record<string, HTMLImageElement>>({});
  const [snapshotImg, setSnapshotImg]   = useState<HTMLImageElement | null>(null);
  const [containerW, setContainerW]   = useState(0);
  const [containerH, setContainerH]  = useState(0);
  const [scale, setScale]             = useState(1);
  const [stagePos, setStagePos]       = useState({ x: 0, y: 0 });

  // Измеряем контейнер
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Начальный масштаб — вписать план по ширине
  useEffect(() => {
    if (didInit.current || containerW < 100) return;
    didInit.current = true;
    const initScale = Math.min(containerW / fp.width, 1);
    const initH = Math.round(fp.height * initScale);
    setScale(initScale);
    setContainerH(initH); // фиксируем высоту один раз — зум её не меняет
    setStagePos({ x: (containerW - fp.width * initScale) / 2, y: 0 });
  }, [containerW, fp.width, fp.height]);

  // Зум колёсиком
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const origin = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const dir = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(0.15, Math.min(4, oldScale * (1 + dir * 0.12)));
    setScale(newScale);
    setStagePos({ x: pointer.x - origin.x * newScale, y: pointer.y - origin.y * newScale });
  }, []);

  const applyZoom = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cx = containerW / 2, cy = containerH / 2;
    const oldScale = stage.scaleX();
    const origin = { x: (cx - stage.x()) / oldScale, y: (cy - stage.y()) / oldScale };
    const newScale = Math.max(0.15, Math.min(4, oldScale * factor));
    setScale(newScale);
    setStagePos({ x: cx - origin.x * newScale, y: cy - origin.y * newScale });
  }, [containerW, containerH]);

  const resetZoom = useCallback(() => {
    const initScale = Math.min(containerW / fp.width, 1);
    setScale(initScale);
    setStagePos({ x: (containerW - fp.width * initScale) / 2, y: 0 });
  }, [containerW, fp.width]);

  const floors = (fp.objects?.filter((o: any) => o.type === 'floor') ?? []) as FloorObject[];
  const tables = (fp.objects?.filter((o: any) => o.type === 'table') ?? []) as TableObject[];
  const decors = (fp.objects?.filter((o: any) => o.type !== 'table' && o.type !== 'floor') ?? []) as DecorativeObject[];

  // Паттерн пола
  const patternCanvas = useMemo(() => {
    if (fp.theme?.bgPatternUrl) return null; // кастомная текстура — приоритет
    const p = fp.theme?.bgPattern;
    if (!p || p === 'none') return null;
    return createPatternCanvas(p, fp.theme?.bgColor);
  }, [fp.theme?.bgPattern, fp.theme?.bgColor, fp.theme?.bgPatternUrl]);

  // Кастомная текстура пола
  const [customTextureImg, setCustomTextureImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const url = fp.theme?.bgPatternUrl;
    if (!url) { setCustomTextureImg(null); return; }
    const img = new Image();
    img.onload = () => setCustomTextureImg(img);
    img.onerror = () => setCustomTextureImg(null);
    img.src = url;
  }, [fp.theme?.bgPatternUrl]);

  const patternScaleX   = fp.theme?.patternScaleX ?? 1;
  const patternScaleY   = fp.theme?.patternScaleY ?? patternScaleX;
  const patternRotation = fp.theme?.patternRotation ?? 0;

  // Preload снапшота зала (быстрый путь — 1 запрос вместо N)
  useEffect(() => {
    const url = fp.snapshotUrl;
    if (!url) { setSnapshotImg(null); return; }
    const img = new Image();
    img.onload = () => setSnapshotImg(img);
    img.onerror = () => setSnapshotImg(null);
    img.src = url;
  }, [fp.snapshotUrl]);

  // Preload текстур покрытий пола
  useEffect(() => {
    const urls = Array.from(new Set(floors.map((f) => f.textureUrl)));
    if (urls.length === 0) return;
    Promise.all(
      urls.map((url) => new Promise<[string, HTMLImageElement]>((res, rej) => {
        const img = new Image();
        img.onload = () => res([url, img]);
        img.onerror = () => rej(url);
        img.src = url;
      }))
    ).then((pairs) => setFloorImages(Object.fromEntries(pairs))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp.objects]);

  // Preload иконок столов
  useEffect(() => {
    const urls = Array.from(new Set(tables.flatMap((t) => t.iconUrl ? [t.iconUrl] : [])));
    if (urls.length === 0) return;
    Promise.all(
      urls.map((url) => new Promise<[string, HTMLImageElement]>((res, rej) => {
        const img = new Image();
        img.onload = () => res([url, img]);
        img.onerror = () => rej(url);
        img.src = url;
      }))
    ).then((pairs) => setIconImages(Object.fromEntries(pairs))).catch(() => {});
  }, [tables]);

  // Preload иконок стульев
  useEffect(() => {
    const chairs = (fp.objects?.filter((o: any) => o.type === 'chair') ?? []) as any[];
    const urls = Array.from(new Set(chairs.flatMap((c) => c.iconUrl ? [c.iconUrl as string] : [])));
    if (urls.length === 0) return;
    Promise.all(
      urls.map((url) => new Promise<[string, HTMLImageElement]>((res, rej) => {
        const img = new Image();
        img.onload = () => res([url, img]);
        img.onerror = () => rej(url);
        img.src = url;
      }))
    ).then((pairs) => setChairImages(Object.fromEntries(pairs))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp.objects]);

  // Теги, которые реально используются в этом зале
  const activeTags = useMemo(() => {
    const used = new Set<string>();
    tables.forEach((t) => (t.tags ?? []).forEach((tag) => used.add(tag)));
    return TABLE_TAGS.filter((t) => used.has(t.id));
  }, [tables]);

  const handleTableClick = useCallback((table: TableObject) => {
    const status = tableStatuses[table.id];
    if (status === 'BOOKED') return;
    // LOCKED — разрешаем клик: может быть наш стол после перезагрузки страницы
    if (guestCount > table.maxGuests || guestCount < table.minGuests) return;
    if (tagFilter && !(table.tags ?? []).includes(tagFilter)) return;
    onTableSelect(table.id);
  }, [tableStatuses, guestCount, tagFilter, onTableSelect]);

  // Ждём реального измерения контейнера
  if (containerW === 0) {
    return <div ref={containerRef} className="relative w-full min-h-[200px]" />;
  }

  return (
    <div ref={containerRef} className="relative w-full">

      {/* Фильтр по типу посадки */}
      {activeTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={`text-xs mr-0.5 ${darkMode ? 'text-zinc-400' : 'text-gray-400'}`}>Место:</span>
          <button
            onClick={() => setTagFilter(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              tagFilter === null
                ? 'bg-blue-600 text-white border-blue-600'
                : darkMode
                  ? 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Все
          </button>
          {activeTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setTagFilter(tagFilter === tag.id ? null : tag.id)}
              className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                tagFilter === tag.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : darkMode
                    ? 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tag.icon} {tag.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl" style={{ height: Math.max(containerH, 200) }}>
        <Stage
          ref={stageRef}
          width={containerW}
          height={Math.max(containerH, 200)}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable
          onDragStart={() => { didDrag.current = false; }}
          onDragMove={(e) => { didDrag.current = true; setStagePos({ x: e.target.x(), y: e.target.y() }); }}
          onDragEnd={(e) => { setStagePos({ x: e.target.x(), y: e.target.y() }); }}
          onWheel={handleWheel}
          style={{ background: bgColor, display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          {/* Фон + декор + покрытия — снапшот (1 запрос) или полный рендер (fallback) */}
          {snapshotImg ? (
            <Layer listening={false}>
              <KonvaImage image={snapshotImg} width={fp.width} height={fp.height} />
            </Layer>
          ) : (
            <>
              {/* Фон */}
              <Layer listening={false}>
                <Rect width={fp.width} height={fp.height}
                  fill={patternCanvas || customTextureImg ? undefined : bgColor}
                  fillPatternImage={customTextureImg ?? (patternCanvas as any)}
                  fillPatternRepeat="repeat"
                  fillPatternScaleX={patternScaleX}
                  fillPatternScaleY={patternScaleY}
                  fillPatternRotation={patternRotation} />
              </Layer>

              {/* Покрытие пола */}
              <Layer listening={false}>
                {floors.map((obj) => {
                  const img = floorImages[obj.textureUrl];
                  const scaleX = obj.patternScaleX ?? 1;
                  const scaleY = obj.patternScaleY ?? scaleX;
                  return (
                    <Group key={obj.id} x={obj.x} y={obj.y} rotation={obj.rotation}>
                      {img ? (
                        <Rect width={obj.width} height={obj.height}
                          fillPatternImage={img} fillPatternRepeat="repeat"
                          fillPatternScaleX={scaleX} fillPatternScaleY={scaleY}
                          cornerRadius={4} stroke="rgba(0,0,0,0.1)" strokeWidth={1} opacity={0.9} />
                      ) : (
                        <Rect width={obj.width} height={obj.height}
                          fill="#e5e7eb" cornerRadius={4} stroke="#d1d5db" strokeWidth={1} opacity={0.5} />
                      )}
                    </Group>
                  );
                })}
              </Layer>

              {/* Декор */}
              <Layer listening={false}>
                {decors.map((obj) => {
                  const base = DECOR_COLORS[obj.type] || { fill: '#e5e7eb', stroke: '#9ca3af' };
                  const decorFill   = obj.customFill   ?? base.fill;
                  const decorStroke = obj.customStroke ?? base.stroke;
                  // Стул с иконкой
                  if (obj.type === 'chair' && obj.iconUrl) {
                    const img = chairImages[obj.iconUrl];
                    return (
                      <Group key={obj.id} x={obj.x} y={obj.y} rotation={obj.rotation} opacity={0.92}>
                        {img ? (
                          <KonvaImage image={img} width={obj.width} height={obj.height} />
                        ) : (
                          <Rect width={obj.width} height={obj.height}
                            fill={decorFill} stroke={decorStroke} strokeWidth={1} cornerRadius={4} opacity={0.7} />
                        )}
                      </Group>
                    );
                  }
                  return (
                    <Group key={obj.id} x={obj.x} y={obj.y} rotation={obj.rotation}>
                      {obj.type === 'column' ? (
                        <Ellipse radiusX={obj.width / 2} radiusY={obj.height / 2} x={obj.width / 2} y={obj.height / 2}
                          fill={decorFill} stroke={decorStroke} strokeWidth={2} opacity={0.8} />
                      ) : (
                        <Rect width={obj.width} height={obj.height}
                          fill={decorFill} stroke={decorStroke} strokeWidth={1.5} cornerRadius={2} opacity={0.8} />
                      )}
                      {obj.label && obj.type !== 'wall' && obj.type !== 'window' && obj.type !== 'chair' && (
                        <Text x={0} y={obj.height / 2 - 6} width={obj.width} align="center"
                          text={obj.label} fontSize={11} fill="#6b7280" fontStyle="bold" />
                      )}
                    </Group>
                  );
                })}
              </Layer>
            </>
          )}

          {/* Столы */}
          <Layer>
            {tables.map((table) => {
              const status = tableStatuses[table.id] as any;
              const isSelected = table.id === selectedTableId;
              const isHovered = table.id === hoveredId;
              const isTagFiltered = !!tagFilter && !(table.tags ?? []).includes(tagFilter);
              const isDisabled = guestCount > table.maxGuests || guestCount < table.minGuests || isTagFiltered;
              const isBooked = status === 'BOOKED';
              const isLocked = status === 'LOCKED';
              const colors = getTableColor(table, status, isSelected, guestCount, tagFilter, darkMode, fp.theme?.tableStyle);
              const cx = table.width / 2;
              const cy = table.height / 2;
              const freeUntil = tableFreeUntil[table.id];
              const iconImg = table.iconUrl ? iconImages[table.iconUrl] : null;
              // при наличии иконки — статус показываем через opacity, не заливку
              const iconOpacity = iconImg ? (isBooked ? 0.35 : isDisabled ? 0.45 : isLocked ? 0.6 : 1) : 1;

              return (
                <Group
                  key={table.id}
                  x={table.x} y={table.y}
                  rotation={table.rotation}
                  onClick={() => { if (!didDrag.current) handleTableClick(table); }}
                  onTap={() => handleTableClick(table)}
                  onMouseEnter={(e) => {
                    if (!isDisabled && !isBooked && !isTagFiltered) setHoveredId(table.id);
                    if (freeUntil) {
                      const me = e.evt as MouseEvent;
                      setTooltip({ x: me.clientX, y: me.clientY, text: `Свободен до ${formatHHMM(freeUntil)}` });
                    }
                  }}
                  onMouseMove={(e) => {
                    if (tooltip) {
                      const me = e.evt as MouseEvent;
                      setTooltip((prev) => prev ? { ...prev, x: me.clientX, y: me.clientY } : null);
                    }
                  }}
                  onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
                  style={{ cursor: isDisabled || isBooked ? 'not-allowed' : 'pointer' }}
                >
                  {/* Фигура или кастомная иконка */}
                  {iconImg ? (
                    <KonvaImage
                      image={iconImg}
                      width={table.width} height={table.height}
                      cornerRadius={table.shape === 'ROUND' ? Math.min(table.width, table.height) / 2 : 6}
                      opacity={iconOpacity}
                    />
                  ) : table.shape === 'ROUND' ? (
                    <Ellipse radiusX={cx} radiusY={cy} x={cx} y={cy}
                      fill={colors.fill}
                      stroke={isSelected ? '#2563eb' : isHovered ? '#60a5fa' : colors.stroke}
                      strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                      shadowColor={isSelected ? '#3b82f6' : 'transparent'} shadowBlur={isSelected ? 8 : 0} />
                  ) : (
                    <Rect width={table.width} height={table.height}
                      cornerRadius={table.shape === 'SQUARE' ? 8 : 6}
                      fill={colors.fill}
                      stroke={isSelected ? '#2563eb' : isHovered ? '#60a5fa' : colors.stroke}
                      strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                      shadowColor={isSelected ? '#3b82f6' : 'transparent'} shadowBlur={isSelected ? 8 : 0} />
                  )}

                  {/* Контур статуса поверх иконки */}
                  {iconImg && (
                    table.shape === 'ROUND'
                      ? <Ellipse radiusX={cx} radiusY={cy} x={cx} y={cy} fill="transparent"
                          stroke={isSelected ? '#2563eb' : isBooked ? '#f87171' : isLocked ? '#fbbf24' : isHovered ? '#60a5fa' : 'transparent'}
                          strokeWidth={isSelected || isBooked || isLocked ? 3 : 2} />
                      : <Rect width={table.width} height={table.height} cornerRadius={6} fill="transparent"
                          stroke={isSelected ? '#2563eb' : isBooked ? '#f87171' : isLocked ? '#fbbf24' : isHovered ? '#60a5fa' : 'transparent'}
                          strokeWidth={isSelected || isBooked || isLocked ? 3 : 2} />
                  )}

                  {/* Номер стола */}
                  <Text x={0} y={cy - 14} width={table.width} align="center"
                    text={table.label}
                    fontSize={Math.min(16, table.width / 4)} fontStyle="bold"
                    fill={table.customTextColor ?? colors.text}
                    shadowColor={iconImg ? 'rgba(0,0,0,0.5)' : undefined} shadowBlur={iconImg ? 2 : 0} />

                  {/* Вместимость */}
                  <Text x={0} y={cy + 5} width={table.width} align="center"
                    text={seatsLabel(table.minGuests, table.maxGuests)}
                    fontSize={Math.min(9, table.width / 9)}
                    fill={table.customTextColor ?? colors.text} opacity={0.7} />

                  {(isBooked || isLocked) && (
                    <Text x={0} y={table.height - 16} width={table.width} align="center"
                      text={isLocked ? '🔒' : '✕'} fontSize={12} fill={colors.text} />
                  )}

                  {/* Иконки тегов */}
                  {!isBooked && !isLocked && table.tags && table.tags.length > 0 && (
                    <Text x={0} y={cy + 18} width={table.width} align="center"
                      text={table.tags.slice(0, 4).map((id) => TABLE_TAGS.find((t) => t.id === id)?.icon ?? '').join(' ')}
                      fontSize={Math.min(12, table.width / 7)} opacity={isDisabled ? 0.4 : 0.85} />
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>

        {/* Зум-кнопки */}
        <ZoomControls
          scale={scale}
          onZoomIn={() => applyZoom(1.25)}
          onZoomOut={() => applyZoom(0.8)}
          onReset={resetZoom}
          darkMode={darkMode}
        />
      </div>

      {/* DOM-тултип */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Легенда */}
      <div className={`flex items-center gap-4 mt-3 text-xs flex-wrap ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
        {(darkMode ? [
          { color: 'bg-green-900 border-green-500', label: 'Свободен' },
          { color: 'bg-red-900 border-red-500',     label: 'Занят' },
          { color: 'bg-blue-900 border-blue-500',   label: 'Выбран' },
          { color: 'bg-zinc-700 border-zinc-500',   label: 'Не подходит' },
        ] : [
          { color: 'bg-green-100 border-green-400', label: 'Свободен' },
          { color: 'bg-red-100 border-red-400',     label: 'Занят' },
          { color: 'bg-blue-100 border-blue-400',   label: 'Выбран' },
          { color: 'bg-gray-100 border-gray-300',   label: 'Не подходит по вместимости' },
        ]).map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded border ${item.color}`} />
            <span>{item.label}</span>
          </div>
        ))}
        <span className={`ml-auto ${darkMode ? 'text-zinc-600' : 'text-gray-400'}`}>Зажмите фон — перемещение</span>
      </div>
    </div>
  );
}
