'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { FloorPlan, FloorPlanObject, TableObject, DecorativeObject } from '@/types';
import type { Tool } from '../hall-editor/HallEditor';
import { v4 as uuidv4 } from 'uuid';

const KonvaCanvas = dynamic(() => import('../hall-editor/KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

const MAX_OBJECTS = 15;

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  'table-round':    { width: 80,  height: 80  },
  'table-square':   { width: 80,  height: 80  },
  'table-rectangle':{ width: 120, height: 80  },
  wall:             { width: 200, height: 20  },
  window:           { width: 100, height: 15  },
  bar:              { width: 250, height: 60  },
  entrance:         { width: 80,  height: 20  },
};

const DECOR_LABELS: Record<string, string> = {
  wall: 'Стена', window: 'Окно', bar: 'Бар', entrance: 'Вход',
};

const TOOLS: { id: Tool; label: string; icon: string; group: 'select' | 'table' | 'decor' }[] = [
  { id: 'select',          label: 'Выбор',           icon: '↖', group: 'select' },
  { id: 'select-box',      label: 'Выделить область', icon: '⬚', group: 'select' },
  { id: 'table-round',     label: 'Круглый стол',    icon: '⬤', group: 'table'  },
  { id: 'table-square',    label: 'Квадратный стол', icon: '■', group: 'table'  },
  { id: 'table-rectangle', label: 'Прямоуг. стол',   icon: '▬', group: 'table'  },
  { id: 'wall',            label: 'Стена',            icon: '▰', group: 'decor'  },
  { id: 'window',          label: 'Окно',             icon: '⬜', group: 'decor' },
  { id: 'bar',             label: 'Барная стойка',   icon: '▭', group: 'decor'  },
  { id: 'entrance',        label: 'Вход / Выход',    icon: '🚪', group: 'decor' },
];

interface DemoEditorProps {
  floorPlan: FloorPlan;
  onChange: (fp: FloorPlan) => void;
}

export default function DemoEditor({ floorPlan, onChange }: DemoEditorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard]     = useState<FloorPlanObject[]>([]);
  const [activeTool, setActiveTool]   = useState<Tool>('select');
  const [canUndo, setCanUndo]         = useState(false);
  const [limitMsg, setLimitMsg]       = useState(false);

  const tableCounter = useRef(
    floorPlan.objects.filter((o) => o.type === 'table').length + 1,
  );

  const selectedIdsRef  = useRef<string[]>([]);
  const clipboardRef    = useRef<FloorPlanObject[]>([]);
  const floorPlanRef    = useRef(floorPlan);
  floorPlanRef.current  = floorPlan;
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  const historyRef = useRef<FloorPlan[]>([]);

  const pushAndUpdate = useCallback((prev: FloorPlan, next: FloorPlan) => {
    historyRef.current = [...historyRef.current.slice(-49), prev];
    setCanUndo(true);
    onChange(next);
  }, [onChange]);

  // ─── Select ───────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id: string, shiftKey?: boolean) => {
    setSelectedIds((prev) =>
      shiftKey
        ? prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        : [id],
    );
  }, []);

  // ─── Add object ───────────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (activeTool === 'select' || activeTool === 'select-box') return;
    if (floorPlanRef.current.objects.length >= MAX_OBJECTS) {
      setLimitMsg(true);
      setTimeout(() => setLimitMsg(false), 2500);
      return;
    }
    const size = DEFAULT_SIZES[activeTool] || { width: 80, height: 80 };
    const id = uuidv4();

    if (activeTool.startsWith('table-')) {
      const shape = activeTool === 'table-round' ? 'ROUND' : activeTool === 'table-square' ? 'SQUARE' : 'RECTANGLE';
      const newTable: TableObject = {
        type: 'table', id,
        label: String(tableCounter.current++),
        shape,
        x: Math.round(x - size.width / 2),
        y: Math.round(y - size.height / 2),
        width: size.width, height: size.height, rotation: 0,
        minGuests: 1,
        maxGuests: shape === 'RECTANGLE' ? 6 : 4,
      };
      const next = { ...floorPlanRef.current, objects: [...floorPlanRef.current.objects, newTable] };
      pushAndUpdate(floorPlanRef.current, next);
    } else {
      const newDecor: DecorativeObject = {
        type: activeTool as any, id,
        x: Math.round(x - size.width / 2),
        y: Math.round(y - size.height / 2),
        width: size.width, height: size.height, rotation: 0,
        label: DECOR_LABELS[activeTool] || activeTool,
      };
      const next = { ...floorPlanRef.current, objects: [...floorPlanRef.current.objects, newDecor] };
      pushAndUpdate(floorPlanRef.current, next);
    }
    setSelectedIds([id]);
    setActiveTool('select');
  }, [activeTool, pushAndUpdate]);

  // ─── Move / Transform ────────────────────────────────────────────────────
  const handleObjectMove = useCallback((id: string, x: number, y: number) => {
    const ids = selectedIdsRef.current;
    const fp  = floorPlanRef.current;
    if (ids.length > 1 && ids.includes(id)) {
      const movedObj = fp.objects.find((o) => o.id === id);
      if (!movedObj) return;
      const dx = Math.round(x) - movedObj.x;
      const dy = Math.round(y) - movedObj.y;
      const next = { ...fp, objects: fp.objects.map((o) => ids.includes(o.id) ? { ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : o) };
      pushAndUpdate(fp, next);
    } else {
      const next = { ...fp, objects: fp.objects.map((o) => o.id === id ? { ...o, x: Math.round(x), y: Math.round(y) } : o) };
      pushAndUpdate(fp, next);
    }
  }, [pushAndUpdate]);

  const handleObjectTransform = useCallback((id: string, x: number, y: number, width: number, height: number, rotation: number) => {
    const fp   = floorPlanRef.current;
    const next = { ...fp, objects: fp.objects.map((o) => o.id === id ? { ...o, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), rotation: Math.round(rotation) } : o) };
    pushAndUpdate(fp, next);
  }, [pushAndUpdate]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const fp   = floorPlanRef.current;
    const next = { ...fp, objects: fp.objects.filter((o) => !ids.includes(o.id)) };
    pushAndUpdate(fp, next);
    setSelectedIds([]);
  }, [pushAndUpdate]);

  // ─── Copy / Paste ─────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const ids  = selectedIdsRef.current;
    const objs = floorPlanRef.current.objects.filter((o) => ids.includes(o.id));
    if (objs.length > 0) setClipboard(objs);
  }, []);

  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (cb.length === 0) return;
    const fp = floorPlanRef.current;
    if (fp.objects.length + cb.length > MAX_OBJECTS) {
      setLimitMsg(true);
      setTimeout(() => setLimitMsg(false), 2500);
      return;
    }
    const newObjects: FloorPlanObject[] = cb.map((obj) => {
      const newId = uuidv4();
      if (obj.type === 'table') {
        return { ...obj, id: newId, x: obj.x + 20, y: obj.y + 20, label: String(tableCounter.current++) } as TableObject;
      }
      return { ...obj, id: newId, x: obj.x + 20, y: obj.y + 20 } as DecorativeObject;
    });
    const next = { ...fp, objects: [...fp.objects, ...newObjects] };
    pushAndUpdate(fp, next);
    setSelectedIds(newObjects.map((o) => o.id));
    setClipboard(newObjects.map((o) => ({ ...o })));
  }, [pushAndUpdate]);

  // ─── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    onChange(prev);
    setSelectedIds([]);
    setCanUndo(historyRef.current.length > 0);
  }, [onChange]);

  const handleCopyRef  = useRef(handleCopy);
  const handlePasteRef = useRef(handlePaste);
  const handleUndoRef  = useRef(handleUndo);
  handleCopyRef.current  = handleCopy;
  handlePasteRef.current = handlePaste;
  handleUndoRef.current  = handleUndo;

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const code = e.code;
      const ctrl = e.ctrlKey || e.metaKey;
      if (code === 'Delete' || code === 'Backspace') { deleteSelected(); return; }
      if (code === 'Escape') { setSelectedIds([]); setActiveTool('select'); return; }
      if (ctrl && code === 'KeyZ') { e.preventDefault(); handleUndoRef.current(); return; }
      if (ctrl && code === 'KeyC') { e.preventDefault(); handleCopyRef.current(); return; }
      if (ctrl && code === 'KeyV') { e.preventDefault(); handlePasteRef.current(); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deleteSelected]);

  const tablesCount = floorPlan.objects.filter((o) => o.type === 'table').length;
  const totalCount  = floorPlan.objects.length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Основной зал</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tablesCount} столов</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${totalCount >= MAX_OBJECTS ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
            {totalCount}/{MAX_OBJECTS}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ↩ Отменить
          </button>
          <button
            onClick={handleCopy}
            disabled={selectedIds.length === 0}
            title="Копировать (Ctrl+C)"
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            📋
          </button>
          <button
            onClick={handlePaste}
            disabled={clipboard.length === 0}
            title="Вставить (Ctrl+V)"
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            📌
          </button>
        </div>
      </div>

      {/* Limit warning */}
      {limitMsg && (
        <div className="bg-orange-50 border-b border-orange-100 px-3 py-1.5 text-xs text-orange-700 text-center">
          Достигнут лимит {MAX_OBJECTS} объектов — в полной версии без ограничений
        </div>
      )}

      {/* Mobile: "tap to add" hint strip */}
      {activeTool !== 'select' && activeTool !== 'select-box' && (
        <div className="md:hidden bg-orange-50 border-b border-orange-100 px-3 py-1 text-[11px] text-orange-700 text-center flex-shrink-0">
          Нажмите на схему чтобы добавить
        </div>
      )}

      {/* Main content: column on mobile, row on desktop */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* Toolbar — horizontal scroll on mobile, vertical column on desktop */}
        <div className="
          flex flex-row overflow-x-auto bg-white border-b border-gray-200 flex-shrink-0 px-2 py-1.5 gap-1
          md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r md:w-36 md:py-1 md:px-0 md:gap-0
        ">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors
                md:w-full md:rounded-none md:px-2 md:py-1.5
                ${activeTool === tool.id
                  ? 'bg-orange-50 text-orange-700 font-medium ring-1 ring-orange-200 md:ring-0'
                  : 'hover:bg-gray-50 text-gray-700'}
              `}
            >
              <span className="text-base flex-shrink-0 w-5 text-center">{tool.icon}</span>
              <span className="hidden md:inline truncate leading-tight text-xs">{tool.label}</span>
            </button>
          ))}

          {/* Desktop: "click to add" hint */}
          {activeTool !== 'select' && activeTool !== 'select-box' && (
            <div className="hidden md:block m-2 mt-auto p-2 bg-orange-50 rounded-lg text-[10px] text-orange-700 text-center">
              Кликните на схему
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative min-h-[220px]">
          <KonvaCanvas
            floorPlan={floorPlan}
            selectedIds={selectedIds}
            activeTool={activeTool}
            onSelect={handleSelect}
            onDeselectAll={() => setSelectedIds([])}
            onBoxSelect={(ids) => { setSelectedIds(ids); setActiveTool('select'); }}
            onCanvasClick={handleCanvasClick}
            onObjectMove={handleObjectMove}
            onObjectTransform={handleObjectTransform}
          />
        </div>

        {/* Properties panel — below canvas on mobile, right column on desktop */}
        <div className="
          border-t border-gray-200 bg-white flex-shrink-0 overflow-y-auto
          md:border-t-0 md:border-l md:w-44
        ">
          <DemoPropertiesPanel
            selected={floorPlan.objects.find((o) => selectedIds[0] === o.id) ?? null}
            selectedCount={selectedIds.length}
            onDelete={deleteSelected}
          />
        </div>

      </div>
    </div>
  );
}

// ─── Simplified properties panel ──────────────────────────────────────────────

function DemoPropertiesPanel({
  selected,
  selectedCount,
  onDelete,
}: {
  selected: FloorPlanObject | null;
  selectedCount: number;
  onDelete: () => void;
}) {
  // На мобайле — горизонтальный компактный вид, на десктопе — вертикальный
  if (selectedCount > 1) {
    return (
      <div className="p-3 flex items-center gap-3 md:flex-col md:items-stretch md:gap-3">
        <p className="text-xs font-semibold text-gray-700 flex-shrink-0">Выбрано: {selectedCount}</p>
        <button onClick={onDelete} className="py-1.5 px-3 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
          🗑 Удалить ({selectedCount})
        </button>
      </div>
    );
  }

  if (selected && selected.type === 'table') {
    return (
      <div className="p-3">
        <TableProps table={selected as TableObject} />
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Mobile: compact horizontal shortcuts */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 md:hidden text-[11px] text-gray-400">
        <span className="font-medium text-gray-500 w-full">Горячие клавиши:</span>
        <span><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Ctrl+Z</kbd> отмена</span>
        <span><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Del</kbd> удалить</span>
        <span><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Ctrl+C/V</kbd> копировать</span>
      </div>
      {/* Desktop: full shortcuts */}
      <div className="hidden md:block text-xs text-gray-400 space-y-2">
        <p className="font-medium text-gray-600">Горячие клавиши</p>
        <p><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Ctrl+Z</kbd> отменить</p>
        <p><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Ctrl+C/V</kbd> копировать</p>
        <p><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Delete</kbd> удалить</p>
        <p><kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Shift+клик</kbd> несколько</p>
        <div className="pt-2 border-t border-gray-100">
          <p className="text-orange-500 font-medium text-[10px]">💡 В полной версии</p>
          <p className="text-[10px] mt-1">Теги посадки, несколько залов, настройки вместимости</p>
        </div>
      </div>
    </div>
  );
}

function TableProps({ table }: { table: TableObject }) {
  const shapeLabel = table.shape === 'ROUND' ? 'Круглый' : table.shape === 'SQUARE' ? 'Квадратный' : 'Прямоугольный';
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700">Стол {table.label}</p>
      <div className="text-xs text-gray-500 space-y-1">
        <p>Форма: {shapeLabel}</p>
        <p>Мест: {table.minGuests}–{table.maxGuests}</p>
        <p className="text-[10px] text-gray-400">{table.width}×{table.height} пx</p>
      </div>
      <div className="pt-2 border-t border-gray-100 text-[10px] text-orange-500">
        💡 В полной версии: теги, комментарий, точная вместимость
      </div>
    </div>
  );
}
