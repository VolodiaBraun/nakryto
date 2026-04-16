'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Ellipse, Text, Group, Transformer, Line, Image as KonvaImage } from 'react-konva';
import type { FloorPlan, FloorPlanObject, FloorTheme, TableObject, DecorativeObject } from '@/types';
import { TABLE_TAGS } from '@/lib/tableTags';
import { createPatternCanvas } from '@/lib/floorPatterns';
import type { Tool } from './HallEditor';
import Konva from 'konva';

// ─── Цвета ────────────────────────────────────────────────────────────────────

const TABLE_COLORS = {
  fill: '#f0fdf4',
  stroke: '#86efac',
  selectedStroke: '#3b82f6',
  text: '#166534',
};

const DECOR_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  wall:     { fill: '#94a3b8', stroke: '#64748b', text: '#ffffff' },
  column:   { fill: '#d1d5db', stroke: '#9ca3af', text: '#374151' },
  bar:      { fill: '#fcd34d', stroke: '#f59e0b', text: '#92400e' },
  window:   { fill: '#bfdbfe', stroke: '#93c5fd', text: '#1e40af' },
  entrance: { fill: '#fef9c3', stroke: '#eab308', text: '#713f12' },
  toilet:   { fill: '#f3e8ff', stroke: '#c084fc', text: '#581c87' },
  stairs:   { fill: '#e0f2fe', stroke: '#38bdf8', text: '#0c4a6e' },
  stage:    { fill: '#fce7f3', stroke: '#f472b6', text: '#831843' },
};

// ─── Константы ────────────────────────────────────────────────────────────────

const GRID_SIZE = 20;
const RULER = 20; // толщина линейки в px

function snapToGrid(val: number) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function seatsLabel(min: number, max: number): string {
  const n = max;
  const l2 = n % 100, l1 = n % 10;
  const form = (l2 >= 11 && l2 <= 14) ? 'мест'
    : l1 === 1 ? 'место'
    : (l1 >= 2 && l1 <= 4) ? 'места'
    : 'мест';
  return `${min}–${max} ${form}`;
}

function buildGrid(width: number, height: number) {
  const lines: React.ReactNode[] = [];
  for (let x = 0; x <= width; x += GRID_SIZE) {
    lines.push(<Line key={`vx${x}`} points={[x, 0, x, height]} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  for (let y = 0; y <= height; y += GRID_SIZE) {
    lines.push(<Line key={`hy${y}`} points={[0, y, width, y]} stroke="#e5e7eb" strokeWidth={0.5} />);
  }
  return lines;
}

// ─── Линейки (DOM) ────────────────────────────────────────────────────────────

function HRuler({ scale, offsetX, width }: { scale: number; offsetX: number; width: number }) {
  const step = scale < 0.35 ? 5 : scale < 0.65 ? 2 : 1;
  const marks: { px: number; m: number }[] = [];
  for (let m = 0; m * 100 * scale + offsetX < width + 60; m += step) {
    const px = m * 100 * scale + offsetX;
    if (px >= RULER - 4) marks.push({ px, m });
  }
  return (
    <div style={{ position: 'absolute', top: 0, left: RULER, right: 0, height: RULER, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', overflow: 'hidden', userSelect: 'none' }}>
      {marks.map(({ px, m }) => (
        <div key={m} style={{ position: 'absolute', left: px - RULER }}>
          <div style={{ width: 1, height: RULER * 0.6, background: '#9ca3af', position: 'absolute', top: 0 }} />
          <span style={{ position: 'absolute', top: 3, left: 3, fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}>{m}м</span>
        </div>
      ))}
    </div>
  );
}

function VRuler({ scale, offsetY, height }: { scale: number; offsetY: number; height: number }) {
  const step = scale < 0.35 ? 5 : scale < 0.65 ? 2 : 1;
  const marks: { py: number; m: number }[] = [];
  for (let m = 0; m * 100 * scale + offsetY < height + 60; m += step) {
    const py = m * 100 * scale + offsetY;
    if (py >= RULER - 4) marks.push({ py, m });
  }
  return (
    <div style={{ position: 'absolute', top: RULER, left: 0, width: RULER, bottom: 0, background: '#f9fafb', borderRight: '1px solid #e5e7eb', overflow: 'hidden', userSelect: 'none' }}>
      {marks.map(({ py, m }) => (
        <div key={m} style={{ position: 'absolute', top: py - RULER }}>
          <div style={{ height: 1, width: RULER * 0.6, background: '#9ca3af', position: 'absolute', left: 0 }} />
          <span style={{ position: 'absolute', left: 1, top: 3, fontSize: 9, color: '#9ca3af', writingMode: 'vertical-lr', transform: 'rotate(180deg)', lineHeight: 1 }}>{m}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Зум-контролы ─────────────────────────────────────────────────────────────

function ZoomControls({ scale, onZoomIn, onZoomOut, onReset }: {
  scale: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
}) {
  const btn = 'w-7 h-7 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium shadow-sm';
  return (
    <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button className={btn} onClick={onZoomIn} title="Увеличить">+</button>
      <button className={btn} onClick={onReset} title="По размеру" style={{ fontSize: 10 }}>{Math.round(scale * 100)}%</button>
      <button className={btn} onClick={onZoomOut} title="Уменьшить">−</button>
    </div>
  );
}

// ─── Стол ─────────────────────────────────────────────────────────────────────

function TableShape({ obj, isSelected, onSelect, onDragEnd, onTransformEnd, draggable, theme }: {
  obj: TableObject;
  isSelected: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, w: number, h: number, r: number) => void;
  draggable: boolean;
  theme?: FloorTheme;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const fill   = obj.customFill   ?? theme?.tableStyle?.fill   ?? TABLE_COLORS.fill;
  const stroke = obj.customStroke ?? theme?.tableStyle?.stroke ?? TABLE_COLORS.stroke;
  const text   = theme?.tableStyle?.text ?? TABLE_COLORS.text;
  const colors = { fill, stroke, selectedStroke: TABLE_COLORS.selectedStroke, text };
  const cx = obj.width / 2;

  // Загрузка кастомной иконки
  const [iconImg, setIconImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!obj.iconUrl) { setIconImg(null); return; }
    const img = new Image();
    img.onload = () => setIconImg(img);
    img.onerror = () => setIconImg(null);
    img.src = obj.iconUrl;
  }, [obj.iconUrl]);
  const cy = obj.height / 2;

  return (
    <Group
      ref={groupRef}
      id={obj.id}
      x={obj.x} y={obj.y}
      rotation={obj.rotation}
      draggable={draggable}
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt.shiftKey); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e) => { onDragEnd(snapToGrid(e.target.x()), snapToGrid(e.target.y())); }}
      onTransformEnd={() => {
        const node = groupRef.current!;
        const sx = node.scaleX(), sy = node.scaleY();
        node.scaleX(1); node.scaleY(1);
        onTransformEnd(snapToGrid(node.x()), snapToGrid(node.y()), Math.max(30, Math.round(obj.width * sx)), Math.max(30, Math.round(obj.height * sy)), node.rotation());
      }}
    >
      {/* Фигура стола или кастомная иконка */}
      {iconImg ? (
        <KonvaImage
          image={iconImg}
          width={obj.width} height={obj.height}
          cornerRadius={obj.shape === 'ROUND' ? Math.min(obj.width, obj.height) / 2 : 6}
        />
      ) : obj.shape === 'ROUND' ? (
        <Ellipse radiusX={cx} radiusY={cy} x={cx} y={cy}
          fill={colors.fill}
          stroke={isSelected ? colors.selectedStroke : colors.stroke}
          strokeWidth={isSelected ? 2.5 : 1.5} />
      ) : (
        <Rect width={obj.width} height={obj.height}
          cornerRadius={obj.shape === 'SQUARE' ? 8 : 6}
          fill={colors.fill}
          stroke={isSelected ? colors.selectedStroke : colors.stroke}
          strokeWidth={isSelected ? 2.5 : 1.5} />
      )}

      {/* Контур выделения поверх иконки */}
      {iconImg && isSelected && (
        obj.shape === 'ROUND'
          ? <Ellipse radiusX={cx} radiusY={cy} x={cx} y={cy} fill="transparent" stroke={colors.selectedStroke} strokeWidth={2.5} />
          : <Rect width={obj.width} height={obj.height} cornerRadius={6} fill="transparent" stroke={colors.selectedStroke} strokeWidth={2.5} />
      )}

      {/* Номер стола */}
      <Text x={0} y={cy - 14} width={obj.width} align="center"
        text={obj.label}
        fontSize={Math.min(16, obj.width / 4)} fontStyle="bold"
        fill={iconImg ? '#ffffff' : colors.text}
        shadowColor={iconImg ? 'rgba(0,0,0,0.6)' : undefined} shadowBlur={iconImg ? 3 : 0} />

      {/* Вместимость */}
      <Text x={0} y={cy + 5} width={obj.width} align="center"
        text={seatsLabel(obj.minGuests, obj.maxGuests)}
        fontSize={Math.min(9, obj.width / 9)}
        fill={iconImg ? '#ffffff' : colors.text}
        opacity={0.8}
        shadowColor={iconImg ? 'rgba(0,0,0,0.5)' : undefined} shadowBlur={iconImg ? 2 : 0} />

      {/* Теги */}
      {obj.tags && obj.tags.length > 0 && (
        <Text x={0} y={cy + 18} width={obj.width} align="center"
          text={obj.tags.slice(0, 4).map((id) => TABLE_TAGS.find((t) => t.id === id)?.icon ?? '').join(' ')}
          fontSize={Math.min(12, obj.width / 7)} />
      )}
    </Group>
  );
}

// ─── Декор ────────────────────────────────────────────────────────────────────

function DecorShape({ obj, isSelected, onSelect, onDragEnd, onTransformEnd, draggable }: {
  obj: DecorativeObject;
  isSelected: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, w: number, h: number, r: number) => void;
  draggable: boolean;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const base   = DECOR_COLORS[obj.type] || { fill: '#e5e7eb', stroke: '#9ca3af', text: '#374151' };
  const colors = {
    fill:   obj.customFill   ?? base.fill,
    stroke: obj.customStroke ?? base.stroke,
    text:   base.text,
  };

  return (
    <Group
      ref={groupRef}
      id={obj.id}
      x={obj.x} y={obj.y}
      rotation={obj.rotation}
      draggable={draggable}
      opacity={0.85}
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt.shiftKey); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e) => onDragEnd(snapToGrid(e.target.x()), snapToGrid(e.target.y()))}
      onTransformEnd={() => {
        const node = groupRef.current!;
        const sx = node.scaleX(), sy = node.scaleY();
        node.scaleX(1); node.scaleY(1);
        onTransformEnd(snapToGrid(node.x()), snapToGrid(node.y()), Math.max(10, Math.round(obj.width * sx)), Math.max(10, Math.round(obj.height * sy)), node.rotation());
      }}
    >
      {obj.type === 'column' ? (
        <Ellipse radiusX={obj.width / 2} radiusY={obj.height / 2} x={obj.width / 2} y={obj.height / 2}
          fill={colors.fill} stroke={isSelected ? '#3b82f6' : colors.stroke} strokeWidth={isSelected ? 2 : 2} />
      ) : (
        <Rect width={obj.width} height={obj.height}
          fill={colors.fill} stroke={isSelected ? '#3b82f6' : colors.stroke}
          strokeWidth={isSelected ? 2 : 1.5} cornerRadius={obj.type === 'bar' ? 4 : 2} />
      )}
      {obj.label && (
        <Text x={0} y={obj.height / 2 - 6} width={obj.width} align="center"
          text={obj.label} fontSize={Math.min(12, obj.width / 6)} fill={colors.text} fontStyle="bold" />
      )}
    </Group>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KonvaCanvasProps {
  floorPlan: FloorPlan;
  selectedIds: string[];
  activeTool: Tool;
  onSelect: (id: string, shiftKey?: boolean) => void;
  onDeselectAll: () => void;
  onBoxSelect: (ids: string[]) => void;
  onCanvasClick: (x: number, y: number) => void;
  onObjectMove: (id: string, x: number, y: number) => void;
  onObjectTransform: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function KonvaCanvas({
  floorPlan, selectedIds, activeTool, onSelect, onDeselectAll, onBoxSelect, onCanvasClick, onObjectMove, onObjectTransform,
}: KonvaCanvasProps) {
  const stageRef       = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const didInit        = useRef(false);
  const didDrag        = useRef(false);
  const isPanning      = useRef(false);
  const panOrigin      = useRef({ mx: 0, my: 0, sx: 0, sy: 0 });

  // Rubber-band selection
  const selBoxStart    = useRef<{ x: number; y: number } | null>(null);
  const selBoxRef      = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Stable refs для mouseUp (избегаем stale closure)
  const floorPlanRef    = useRef(floorPlan);
  floorPlanRef.current  = floorPlan;
  const onBoxSelectRef  = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [scale, setScale]       = useState(0.9);
  const [stagePos, setStagePos] = useState({ x: RULER + 16, y: RULER + 16 });

  const isSelectMode    = activeTool === 'select';
  const isBoxSelectMode = activeTool === 'select-box';
  const selectedId = selectedIds[0] ?? null; // первый выбранный (для Transformer при единственном)

  // Измеряем контейнер
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Первичное масштабирование — вписываем план в экран
  useEffect(() => {
    if (didInit.current || containerSize.w < 100) return;
    didInit.current = true;
    const usableW = containerSize.w - RULER;
    const usableH = containerSize.h - RULER;
    const fitScale = Math.min(usableW / floorPlan.width, usableH / floorPlan.height) * 0.88;
    setScale(fitScale);
    setStagePos({
      x: RULER + (usableW - floorPlan.width * fitScale) / 2,
      y: RULER + (usableH - floorPlan.height * fitScale) / 2,
    });
  }, [containerSize, floorPlan.width, floorPlan.height]);

  // Трансформер (только для одиночного выделения — resize/rotate)
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (selectedIds.length === 1 && isSelectMode) {
      const node = stage.findOne(`#${selectedIds[0]}`);
      if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw(); return; }
    }
    tr.nodes([]);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, isSelectMode, floorPlan]);

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
    const newScale = Math.max(0.08, Math.min(5, oldScale * (1 + dir * 0.12)));
    setScale(newScale);
    setStagePos({ x: pointer.x - origin.x * newScale, y: pointer.y - origin.y * newScale });
  }, []);

  // Зум кнопками
  const applyZoom = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cx = containerSize.w / 2, cy = containerSize.h / 2;
    const oldScale = stage.scaleX();
    const origin = { x: (cx - stage.x()) / oldScale, y: (cy - stage.y()) / oldScale };
    const newScale = Math.max(0.08, Math.min(5, oldScale * factor));
    setScale(newScale);
    setStagePos({ x: cx - origin.x * newScale, y: cy - origin.y * newScale });
  }, [containerSize]);

  const resetZoom = useCallback(() => {
    const usableW = containerSize.w - RULER;
    const usableH = containerSize.h - RULER;
    const fitScale = Math.min(usableW / floorPlan.width, usableH / floorPlan.height) * 0.88;
    setScale(fitScale);
    setStagePos({
      x: RULER + (usableW - floorPlan.width * fitScale) / 2,
      y: RULER + (usableH - floorPlan.height * fitScale) / 2,
    });
  }, [containerSize, floorPlan.width, floorPlan.height]);

  // ─── Мышь: pan + rubber-band ─────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isBoxSelectMode) {
      const stage = stageRef.current!;
      const ptr = stage.getPointerPosition()!;
      const x = (ptr.x - stage.x()) / stage.scaleX();
      const y = (ptr.y - stage.y()) / stage.scaleY();
      selBoxStart.current = { x, y };
      selBoxRef.current = { x, y, w: 0, h: 0 };
      setSelBox({ x, y, w: 0, h: 0 });
      didDrag.current = false;
      return;
    }
    // Pan — только по пустому фону
    if (e.target !== stageRef.current) return;
    isPanning.current = true;
    didDrag.current = false;
    const stage = stageRef.current!;
    panOrigin.current = { mx: e.evt.clientX, my: e.evt.clientY, sx: stage.x(), sy: stage.y() };
  }, [isBoxSelectMode]);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isBoxSelectMode && selBoxStart.current) {
      const stage = stageRef.current!;
      const ptr = stage.getPointerPosition()!;
      const cx = (ptr.x - stage.x()) / stage.scaleX();
      const cy = (ptr.y - stage.y()) / stage.scaleY();
      const sx = selBoxStart.current.x;
      const sy = selBoxStart.current.y;
      const newBox = { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) };
      if (newBox.w > 3 || newBox.h > 3) didDrag.current = true;
      selBoxRef.current = newBox;
      setSelBox(newBox);
      return;
    }
    if (!isPanning.current) return;
    const dx = e.evt.clientX - panOrigin.current.mx;
    const dy = e.evt.clientY - panOrigin.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    setStagePos({ x: panOrigin.current.sx + dx, y: panOrigin.current.sy + dy });
  }, [isBoxSelectMode]);

  const handleMouseUp = useCallback(() => {
    if (isBoxSelectMode && selBoxStart.current) {
      const box = selBoxRef.current;
      selBoxStart.current = null;
      selBoxRef.current = null;
      setSelBox(null);
      if (box && (box.w > 5 || box.h > 5)) {
        const ids = floorPlanRef.current.objects
          .filter((obj) =>
            obj.x < box.x + box.w &&
            obj.x + obj.width > box.x &&
            obj.y < box.y + box.h &&
            obj.y + obj.height > box.y,
          )
          .map((obj) => obj.id);
        if (ids.length > 0) onBoxSelectRef.current(ids);
      }
      return;
    }
    isPanning.current = false;
  }, [isBoxSelectMode]);

  // Клик по сцене
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (didDrag.current) { didDrag.current = false; return; }
    if (isBoxSelectMode) return; // обрабатывается в mouseUp
    if (e.target !== stageRef.current && e.target.getType() !== 'Stage') return;
    if (isSelectMode) {
      onDeselectAll();
    } else {
      const stage = stageRef.current!;
      const ptr = stage.getPointerPosition()!;
      const x = (ptr.x - stage.x()) / stage.scaleX();
      const y = (ptr.y - stage.y()) / stage.scaleY();
      onCanvasClick(x, y);
    }
  }, [isSelectMode, isBoxSelectMode, onDeselectAll, onCanvasClick]);

  const tables = floorPlan.objects.filter((o) => o.type === 'table') as TableObject[];
  const decors = floorPlan.objects.filter((o) => o.type !== 'table') as DecorativeObject[];

  // Паттерн пола — canvas-текстура для Konva fillPatternImage
  const patternCanvas = useMemo(() => {
    const p = floorPlan.theme?.bgPattern;
    if (!p || p === 'none') return null;
    return createPatternCanvas(p, floorPlan.theme?.bgColor);
  }, [floorPlan.theme?.bgPattern, floorPlan.theme?.bgColor]);
  const patternScale    = floorPlan.theme?.patternScale    ?? 1;
  const patternRotation = floorPlan.theme?.patternRotation ?? 0;
  const selectedIdsSet = new Set(selectedIds);

  // Ждём реального измерения контейнера
  if (containerSize.w === 0) {
    return <div ref={containerRef} className="w-full h-full" />;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative bg-gray-200"
      style={{ cursor: activeTool !== 'select' ? 'crosshair' : 'grab' }}
    >
      {/* Линейки (поверх Stage, не блокируют события) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        {/* Угол */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: RULER, height: RULER, background: '#e5e7eb' }} />
        <HRuler scale={scale} offsetX={stagePos.x} width={containerSize.w} />
        <VRuler scale={scale} offsetY={stagePos.y} height={containerSize.h} />
      </div>

      {/* Кнопки зума */}
      <ZoomControls
        scale={scale}
        onZoomIn={() => applyZoom(1.25)}
        onZoomOut={() => applyZoom(0.8)}
        onReset={resetZoom}
      />

      <Stage
        ref={stageRef}
        width={containerSize.w}
        height={containerSize.h}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        {/* Фон + сетка */}
        <Layer listening={false}>
          <Rect width={floorPlan.width} height={floorPlan.height}
            fill={patternCanvas ? undefined : (floorPlan.theme?.bgColor ?? 'white')}
            fillPatternImage={patternCanvas as any}
            fillPatternRepeat="repeat"
            fillPatternScaleX={patternScale}
            fillPatternScaleY={patternScale}
            fillPatternRotation={patternRotation}
            shadowColor="rgba(0,0,0,0.12)" shadowBlur={12} shadowOffsetX={2} shadowOffsetY={2} />
          {buildGrid(floorPlan.width, floorPlan.height)}
        </Layer>

        {/* Декор */}
        <Layer>
          {decors.map((obj) => (
            <DecorShape
              key={obj.id}
              obj={obj}
              isSelected={selectedIdsSet.has(obj.id)}
              onSelect={(shiftKey) => isSelectMode && onSelect(obj.id, shiftKey)}
              onDragEnd={(x, y) => onObjectMove(obj.id, x, y)}
              onTransformEnd={(x, y, w, h, r) => onObjectTransform(obj.id, x, y, w, h, r)}
              draggable={isSelectMode}
            />
          ))}
        </Layer>

        {/* Столы */}
        <Layer>
          {tables.map((obj) => (
            <TableShape
              key={obj.id}
              obj={obj}
              isSelected={selectedIdsSet.has(obj.id)}
              onSelect={(shiftKey) => isSelectMode && onSelect(obj.id, shiftKey)}
              onDragEnd={(x, y) => onObjectMove(obj.id, x, y)}
              onTransformEnd={(x, y, w, h, r) => onObjectTransform(obj.id, x, y, w, h, r)}
              draggable={isSelectMode}
              theme={floorPlan.theme}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            borderStroke="#3b82f6"
            borderStrokeWidth={1.5}
            anchorStroke="#3b82f6"
            anchorFill="white"
            anchorSize={8}
            keepRatio={false}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          />
        </Layer>

        {/* Прямоугольник выделения области */}
        {selBox && (
          <Layer listening={false}>
            <Rect
              x={selBox.x}
              y={selBox.y}
              width={selBox.w}
              height={selBox.h}
              fill="rgba(59,130,246,0.06)"
              stroke="#3b82f6"
              strokeWidth={1 / scale}
              dash={[6 / scale, 3 / scale]}
            />
          </Layer>
        )}
      </Stage>
    </div>
  );
}
