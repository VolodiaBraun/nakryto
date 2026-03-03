'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Ellipse, Text, Group, Line } from 'react-konva';
import type { Hall, FloorPlan, TableObject, DecorativeObject } from '@/types';
import Konva from 'konva';
import { TABLE_TAGS } from '@/lib/tableTags';

interface BookingMapKonvaProps {
  hall: Hall;
  tableStatuses: Record<string, 'FREE' | 'BOOKED' | 'LOCKED'>;
  tableFreeUntil: Record<string, string | null>;
  selectedTableId: string | null;
  guestCount: number;
  onTableSelect: (tableId: string) => void;
}

const STATUS_COLORS = {
  FREE:     { fill: '#dcfce7', stroke: '#4ade80', text: '#166534' },
  BOOKED:   { fill: '#fee2e2', stroke: '#f87171', text: '#991b1b' },
  LOCKED:   { fill: '#fef3c7', stroke: '#fbbf24', text: '#92400e' },
  SELECTED: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af' },
  DISABLED: { fill: '#f3f4f6', stroke: '#d1d5db', text: '#9ca3af' },
};

const DECOR_COLORS: Record<string, { fill: string; stroke: string }> = {
  wall:     { fill: '#94a3b8', stroke: '#64748b' },
  column:   { fill: '#d1d5db', stroke: '#9ca3af' },
  bar:      { fill: '#fcd34d', stroke: '#f59e0b' },
  entrance: { fill: '#fef9c3', stroke: '#eab308' },
  toilet:   { fill: '#f3e8ff', stroke: '#c084fc' },
  stairs:   { fill: '#e0f2fe', stroke: '#38bdf8' },
  stage:    { fill: '#fce7f3', stroke: '#f472b6' },
  window:   { fill: '#bfdbfe', stroke: '#93c5fd' },
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
) {
  if (isSelected) return STATUS_COLORS.SELECTED;
  if (status === 'BOOKED' || status === 'LOCKED') return STATUS_COLORS[status];
  if (guestCount > table.maxGuests || guestCount < table.minGuests) return STATUS_COLORS.DISABLED;
  if (tagFilter && !(table.tags ?? []).includes(tagFilter)) return STATUS_COLORS.DISABLED;
  return STATUS_COLORS.FREE;
}

// ─── Зум-кнопки ───────────────────────────────────────────────────────────────

function ZoomControls({ scale, onZoomIn, onZoomOut, onReset }: {
  scale: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
}) {
  const btn = 'w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium shadow-sm text-sm';
  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
      <button className={btn} onClick={onZoomIn} title="Увеличить">+</button>
      <button className={btn} onClick={onReset} title="По размеру" style={{ fontSize: 10 }}>{Math.round(scale * 100)}%</button>
      <button className={btn} onClick={onZoomOut} title="Уменьшить">−</button>
    </div>
  );
}

export default function BookingMapKonva({
  hall, tableStatuses, tableFreeUntil, selectedTableId, guestCount, onTableSelect,
}: BookingMapKonvaProps) {
  const fp = hall.floorPlan || { width: 800, height: 600, objects: [] };
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const didInit = useRef(false);
  const didDrag = useRef(false);

  const [tagFilter, setTagFilter]     = useState<string | null>(null);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [tooltip, setTooltip]         = useState<{ x: number; y: number; text: string } | null>(null);
  const [containerW, setContainerW]   = useState(700);
  const [containerH, setContainerH]  = useState(400); // фиксированная высота окна
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

  const tables = (fp.objects?.filter((o: any) => o.type === 'table') ?? []) as TableObject[];
  const decors = (fp.objects?.filter((o: any) => o.type !== 'table') ?? []) as DecorativeObject[];

  // Теги, которые реально используются в этом зале
  const activeTags = useMemo(() => {
    const used = new Set<string>();
    tables.forEach((t) => (t.tags ?? []).forEach((tag) => used.add(tag)));
    return TABLE_TAGS.filter((t) => used.has(t.id));
  }, [tables]);

  const handleTableClick = useCallback((table: TableObject) => {
    const status = tableStatuses[table.id];
    if (status === 'BOOKED' || status === 'LOCKED') return;
    if (guestCount > table.maxGuests || guestCount < table.minGuests) return;
    if (tagFilter && !(table.tags ?? []).includes(tagFilter)) return;
    onTableSelect(table.id);
  }, [tableStatuses, guestCount, tagFilter, onTableSelect]);

  return (
    <div ref={containerRef} className="relative w-full">

      {/* Фильтр по типу посадки */}
      {activeTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs text-gray-400 mr-0.5">Место:</span>
          <button
            onClick={() => setTagFilter(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              tagFilter === null
                ? 'bg-blue-600 text-white border-blue-600'
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
          style={{ background: 'white', display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          {/* Фон + сетка */}
          <Layer listening={false}>
            <Rect width={fp.width} height={fp.height} fill="white" />
            {Array.from({ length: Math.floor(fp.width / 40) }).map((_, i) => (
              <Line key={`v${i}`} points={[(i + 1) * 40, 0, (i + 1) * 40, fp.height]} stroke="#f3f4f6" strokeWidth={1} />
            ))}
            {Array.from({ length: Math.floor(fp.height / 40) }).map((_, i) => (
              <Line key={`h${i}`} points={[0, (i + 1) * 40, fp.width, (i + 1) * 40]} stroke="#f3f4f6" strokeWidth={1} />
            ))}
          </Layer>

          {/* Декор */}
          <Layer listening={false}>
            {decors.map((obj) => {
              const colors = DECOR_COLORS[obj.type] || { fill: '#e5e7eb', stroke: '#9ca3af' };
              return (
                <Group key={obj.id} x={obj.x} y={obj.y} rotation={obj.rotation}>
                  {obj.type === 'column' ? (
                    <Ellipse radiusX={obj.width / 2} radiusY={obj.height / 2} x={obj.width / 2} y={obj.height / 2}
                      fill={colors.fill} stroke={colors.stroke} strokeWidth={2} opacity={0.8} />
                  ) : (
                    <Rect width={obj.width} height={obj.height}
                      fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5} cornerRadius={2} opacity={0.8} />
                  )}
                  {obj.label && obj.type !== 'wall' && obj.type !== 'window' && (
                    <Text x={0} y={obj.height / 2 - 6} width={obj.width} align="center"
                      text={obj.label} fontSize={11} fill="#6b7280" fontStyle="bold" />
                  )}
                </Group>
              );
            })}
          </Layer>

          {/* Столы */}
          <Layer>
            {tables.map((table) => {
              const status = tableStatuses[table.id] as any;
              const isSelected = table.id === selectedTableId;
              const isHovered = table.id === hoveredId;
              const isTagFiltered = !!tagFilter && !(table.tags ?? []).includes(tagFilter);
              const isDisabled = guestCount > table.maxGuests || guestCount < table.minGuests || isTagFiltered;
              const isBooked = status === 'BOOKED' || status === 'LOCKED';
              const colors = getTableColor(table, status, isSelected, guestCount, tagFilter);
              const cx = table.width / 2;
              const cy = table.height / 2;
              const freeUntil = tableFreeUntil[table.id];

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
                  {table.shape === 'ROUND' ? (
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

                  {/* Номер стола */}
                  <Text x={0} y={cy - 14} width={table.width} align="center"
                    text={table.label}
                    fontSize={Math.min(16, table.width / 4)} fontStyle="bold" fill={colors.text} />

                  {/* Вместимость */}
                  <Text x={0} y={cy + 5} width={table.width} align="center"
                    text={seatsLabel(table.minGuests, table.maxGuests)}
                    fontSize={Math.min(9, table.width / 9)} fill={colors.text} opacity={0.7} />

                  {isBooked && (
                    <Text x={0} y={table.height - 16} width={table.width} align="center"
                      text="✕" fontSize={12} fill={colors.text} />
                  )}

                  {/* Иконки тегов */}
                  {!isBooked && table.tags && table.tags.length > 0 && (
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
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
        {[
          { color: 'bg-green-100 border-green-400', label: 'Свободен' },
          { color: 'bg-red-100 border-red-400',   label: 'Занят' },
          { color: 'bg-blue-100 border-blue-400',  label: 'Выбран' },
          { color: 'bg-gray-100 border-gray-300',  label: 'Не подходит по вместимости' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded border ${item.color}`} />
            <span>{item.label}</span>
          </div>
        ))}
        <span className="ml-auto text-gray-400">Колёсико / кнопки — масштаб · Зажмите фон — перемещение</span>
      </div>
    </div>
  );
}
