'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Hall, FloorPlan, FloorPlanObject, FloorTheme, TableObject, DecorativeObject } from '@/types';
import { TABLE_TAGS } from '@/lib/tableTags';
import { TABLE_ICONS } from '@/lib/tableIcons';
import { PATTERN_OPTIONS } from '@/lib/floorPatterns';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/context/AuthContext';

// ─── Пресеты тем оформления ───────────────────────────────────────────────────

const HALL_THEME_PRESETS = [
  { id: 'default',  label: 'Стандарт', bgColor: '#ffffff', bgPattern: 'none',     table: { fill: '#dcfce7', stroke: '#86efac', text: '#166534' } },
  { id: 'warm',     label: 'Тёплый',   bgColor: '#fdf6ec', bgPattern: 'none',     table: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' } },
  { id: 'dark',     label: 'Тёмный',   bgColor: '#1c1c2e', bgPattern: 'concrete', table: { fill: '#1e3a5f', stroke: '#3b82f6', text: '#93c5fd' } },
  { id: 'loft',     label: 'Лофт',     bgColor: '#c0bfbd', bgPattern: 'concrete', table: { fill: '#f3f4f6', stroke: '#6b7280', text: '#1f2937' } },
  { id: 'classic',  label: 'Классика', bgColor: '#c8a96e', bgPattern: 'parquet',  table: { fill: '#fdf8f0', stroke: '#a97c50', text: '#5c3d1e' } },
  { id: 'terrace',  label: 'Терраса',  bgColor: '#d4c8a0', bgPattern: 'stone',    table: { fill: '#f0fdf4', stroke: '#4ade80', text: '#166534' } },
] as const;

const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

// ─── Масштаб: 1 px = 1 см ─────────────────────────────────────────────────────

const pxToCm = (px: number) => Math.round(px);
const pxToM  = (px: number) => (px / 100).toFixed(1);
const mToPx  = (m: number)  => Math.round(m * 100);

// ─── Инструменты ──────────────────────────────────────────────────────────────

export type Tool =
  | 'select'
  | 'select-box'
  | 'table-round'
  | 'table-square'
  | 'table-rectangle'
  | 'wall'
  | 'column'
  | 'bar'
  | 'window'
  | 'entrance'
  | 'toilet'
  | 'stairs'
  | 'stage';

interface ToolItem {
  id: Tool;
  label: string;
  icon: string;
  group: 'select' | 'table' | 'decor';
}

const TOOLS: ToolItem[] = [
  { id: 'select',           label: 'Выбор',          icon: '↖',  group: 'select' },
  { id: 'select-box',       label: 'Выделить область',icon: '⬚', group: 'select' },
  { id: 'table-round',      label: 'Круглый стол',   icon: '⬤',  group: 'table' },
  { id: 'table-square',     label: 'Квадратный стол',icon: '■',  group: 'table' },
  { id: 'table-rectangle',  label: 'Прямоуг. стол',  icon: '▬',  group: 'table' },
  { id: 'wall',             label: 'Стена',           icon: '▰',  group: 'decor' },
  { id: 'window',           label: 'Окно',            icon: '⬜', group: 'decor' },
  { id: 'column',           label: 'Колонна',         icon: '◉',  group: 'decor' },
  { id: 'bar',              label: 'Барная стойка',   icon: '▭',  group: 'decor' },
  { id: 'entrance',         label: 'Вход / Выход',    icon: '🚪', group: 'decor' },
  { id: 'toilet',           label: 'Туалет',          icon: '🚻', group: 'decor' },
  { id: 'stairs',           label: 'Лестница',        icon: '🪜', group: 'decor' },
  { id: 'stage',            label: 'Сцена',           icon: '🎭', group: 'decor' },
];

const GROUP_LABELS: Record<string, string> = {
  select: '',
  table:  'Столы',
  decor:  'Элементы зала',
};

// ─── Дефолтные размеры (в пикселях = сантиметрах) ────────────────────────────

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  'table-round':     { width: 80,  height: 80  },
  'table-square':    { width: 80,  height: 80  },
  'table-rectangle': { width: 120, height: 80  },
  wall:              { width: 200, height: 20  },
  window:            { width: 100, height: 15  },
  column:            { width: 40,  height: 40  },
  bar:               { width: 250, height: 60  },
  entrance:          { width: 80,  height: 20  },
  toilet:            { width: 120, height: 100 },
  stairs:            { width: 120, height: 80  },
  stage:             { width: 300, height: 120 },
};

const DECOR_LABELS: Record<string, string> = {
  wall:     'Стена',
  window:   'Окно',
  column:   'Колонна',
  bar:      'Бар',
  entrance: 'Вход',
  toilet:   'Туалет',
  stairs:   'Лестница',
  stage:    'Сцена',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface HallEditorProps {
  hall: Hall;
  onSave?: (floorPlan: FloorPlan) => Promise<void>;
  onPreview?: () => void;
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function HallEditor({ hall, onSave, onPreview }: HallEditorProps) {
  const [floorPlan, setFloorPlan] = useState<FloorPlan>(
    hall.floorPlan || { width: 800, height: 600, objects: [] },
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<FloorPlanObject[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const tableCounter = useRef(floorPlan.objects.filter((o) => o.type === 'table').length + 1);

  // ─── Стабильные рефы (для keyboard handler без stale closure) ──────────────
  const selectedIdsRef = useRef<string[]>([]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const clipboardRef = useRef<FloorPlanObject[]>([]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  // floorPlanRef — актуальное состояние плана (без stale closure в callbacks)
  const floorPlanRef = useRef(floorPlan);
  floorPlanRef.current = floorPlan;

  // История для отмены (Ctrl+Z)
  const historyRef = useRef<FloorPlan[]>([]);
  const pushToHistory = (fp: FloorPlan) => {
    historyRef.current = [...historyRef.current.slice(-49), fp];
    setCanUndo(true);
  };

  // ─── Derived ───────────────────────────────────────────────────────────────
  const selectedId = selectedIds[0] ?? null;
  const selectedObject = selectedId ? (floorPlan.objects.find((o) => o.id === selectedId) || null) : null;
  const selectedTable = selectedObject?.type === 'table' ? (selectedObject as TableObject) : null;
  const selectedDecor = selectedObject && selectedObject.type !== 'table' ? (selectedObject as DecorativeObject) : null;

  // ─── Select ────────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string, shiftKey?: boolean) => {
    setSelectedIds((prev) =>
      shiftKey
        ? prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        : [id],
    );
  }, []);

  // ─── Добавление объекта на холст ───────────────────────────────────────────

  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (activeTool === 'select' || activeTool === 'select-box') return;
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
      setFloorPlan((prev) => { pushToHistory(prev); return { ...prev, objects: [...prev.objects, newTable] }; });
    } else {
      const newDecor: DecorativeObject = {
        type: activeTool as any, id,
        x: Math.round(x - size.width / 2),
        y: Math.round(y - size.height / 2),
        width: size.width, height: size.height, rotation: 0,
        label: DECOR_LABELS[activeTool] || activeTool,
      };
      setFloorPlan((prev) => { pushToHistory(prev); return { ...prev, objects: [...prev.objects, newDecor] }; });
    }
    setSelectedIds([id]);
    setActiveTool('select');
  }, [activeTool]);

  // ─── Перемещение (поддержка группового перемещения) ───────────────────────

  const handleObjectMove = useCallback((id: string, x: number, y: number) => {
    const ids = selectedIdsRef.current;
    if (ids.length > 1 && ids.includes(id)) {
      setFloorPlan((prev) => {
        pushToHistory(prev);
        const movedObj = prev.objects.find((o) => o.id === id);
        if (!movedObj) return prev;
        const dx = Math.round(x) - movedObj.x;
        const dy = Math.round(y) - movedObj.y;
        return {
          ...prev,
          objects: prev.objects.map((o) =>
            ids.includes(o.id) ? { ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : o,
          ),
        };
      });
    } else {
      setFloorPlan((prev) => {
        pushToHistory(prev);
        return { ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, x: Math.round(x), y: Math.round(y) } : o) };
      });
    }
  }, []);

  const handleObjectTransform = useCallback((id: string, x: number, y: number, width: number, height: number, rotation: number) => {
    setFloorPlan((prev) => {
      pushToHistory(prev);
      return {
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === id ? { ...o, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), rotation: Math.round(rotation) } : o,
        ),
      };
    });
  }, []);

  const updateSelected = (updates: Partial<FloorPlanObject>) => {
    if (!selectedId) return;
    setFloorPlan((prev) => {
      pushToHistory(prev);
      return { ...prev, objects: prev.objects.map((o) => o.id === selectedId ? { ...o, ...updates } : o) as any };
    });
  };

  const rotateSelected = (deg: number) => {
    if (!selectedObject) return;
    const cur = selectedObject.rotation || 0;
    setFloorPlan((prev) => {
      pushToHistory(prev);
      return { ...prev, objects: prev.objects.map((o) => o.id === selectedId ? { ...o, rotation: (cur + deg + 360) % 360 } : o) };
    });
  };

  // ─── Удаление ──────────────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    setFloorPlan((prev) => { pushToHistory(prev); return { ...prev, objects: prev.objects.filter((o) => !ids.includes(o.id)) }; });
    setSelectedIds([]);
  }, []);

  // ─── Копировать / Вставить ─────────────────────────────────────────────────

  // ─── ИСПРАВЛЕНО: используем floorPlanRef вместо setFloorPlan (нельзя вызывать
  //                setState внутри setState updater)
  const handleCopy = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const objs = floorPlanRef.current.objects.filter((o) => ids.includes(o.id));
    if (objs.length > 0) setClipboard(objs);
  }, []);

  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (cb.length === 0) return;
    const OFFSET = 20;
    const newObjects: FloorPlanObject[] = cb.map((obj) => {
      const newId = uuidv4();
      if (obj.type === 'table') {
        return { ...obj, id: newId, x: obj.x + OFFSET, y: obj.y + OFFSET, label: String(tableCounter.current++) } as TableObject;
      }
      return { ...obj, id: newId, x: obj.x + OFFSET, y: obj.y + OFFSET } as DecorativeObject;
    });
    setFloorPlan((prev) => { pushToHistory(prev); return { ...prev, objects: [...prev.objects, ...newObjects] }; });
    setSelectedIds(newObjects.map((o) => o.id));
    setClipboard(newObjects.map((o) => ({ ...o })));
  }, []);

  // ─── Отмена действия ───────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setFloorPlan(prev);
    setSelectedIds([]);
    setCanUndo(historyRef.current.length > 0);
  }, []);

  // Рефы для keyboard handler (избегаем stale closure)
  const handleCopyRef = useRef(handleCopy);
  const handlePasteRef = useRef(handlePaste);
  const handleUndoRef = useRef(handleUndo);
  handleCopyRef.current = handleCopy;
  handlePasteRef.current = handlePaste;
  handleUndoRef.current = handleUndo;

  // ─── Клавиатура ────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Используем e.code (физическая клавиша) — работает при любой раскладке
      // e.key зависит от раскладки: при русской Ctrl+С → e.key='с', а не 'c'
      const code = e.code;
      const ctrl = e.ctrlKey || e.metaKey;

      if (code === 'Delete' || code === 'Backspace') { deleteSelected(); return; }
      if (code === 'Escape') { setSelectedIds([]); setActiveTool('select'); return; }
      if (ctrl && code === 'KeyZ') { e.preventDefault(); handleUndoRef.current(); return; }
      if (ctrl && code === 'KeyC') { e.preventDefault(); handleCopyRef.current(); return; }
      if (ctrl && code === 'KeyV') { e.preventDefault(); handlePasteRef.current(); return; }
    };
    // document надёжнее window в Next.js / React 18
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deleteSelected]);

  // ─── Сохранение ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(floorPlan);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const tablesCount = floorPlan.objects.filter((o) => o.type === 'table').length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-900">{hall.name}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tablesCount} столов</span>
          {/* Размер зала — редактируемый */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Размер:</span>
            <input
              type="number"
              value={Number(pxToM(floorPlan.width))}
              onChange={(e) => setFloorPlan((p) => ({ ...p, width: mToPx(Number(e.target.value)) }))}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
              min={2} max={50} step={0.5}
            />
            <span>×</span>
            <input
              type="number"
              value={Number(pxToM(floorPlan.height))}
              onChange={(e) => setFloorPlan((p) => ({ ...p, height: mToPx(Number(e.target.value)) }))}
              className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
              min={2} max={50} step={0.5}
            />
            <span className="text-gray-400">м</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Отменить */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ↩ Отменить
          </button>

          {/* Копировать / Вставить + подсказка */}
          <div className="flex items-center gap-1 border-r border-gray-200 pr-2 mr-1">
            <span className="hidden lg:flex items-center gap-1 text-xs text-gray-400 mr-1 select-none">
              <kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">Shift+клик</kbd>
              <span>или</span>
              <kbd className="bg-gray-100 border border-gray-200 px-1 rounded text-[10px]">⬚</kbd>
              <span>— выбрать несколько</span>
            </span>
            <button
              onClick={handleCopy}
              disabled={selectedIds.length === 0}
              title="Копировать (Ctrl+C)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span>📋</span>
              <span className="hidden sm:inline">Копировать</span>
              {selectedIds.length > 1 && <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 font-medium">{selectedIds.length}</span>}
            </button>
            <button
              onClick={handlePaste}
              disabled={clipboard.length === 0}
              title="Вставить (Ctrl+V)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span>📌</span>
              <span className="hidden sm:inline">Вставить</span>
            </button>
          </div>

          {onPreview && (
            <button onClick={onPreview} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              👁 Предпросмотр
            </button>
          )}
          {onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-44 bg-white border-r border-gray-200 flex flex-col py-2 overflow-y-auto flex-shrink-0">
          {(['select', 'table', 'decor'] as const).map((group) => {
            const groupTools = TOOLS.filter((t) => t.group === group);
            return (
              <div key={group} className="mb-1">
                {GROUP_LABELS[group] && (
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1">
                    {GROUP_LABELS[group]}
                  </p>
                )}
                {groupTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                      activeTool === tool.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-base w-5 text-center flex-shrink-0">{tool.icon}</span>
                    <span className="truncate text-xs leading-tight">{tool.label}</span>
                  </button>
                ))}
                {group !== 'decor' && <div className="mx-3 my-1 border-b border-gray-100" />}
              </div>
            );
          })}

          {activeTool !== 'select' && (
            <div className="m-2 mt-auto p-2 bg-blue-50 rounded-lg text-xs text-blue-700 text-center">
              Кликните на схему чтобы добавить
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative">
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

        {/* Right Panel */}
        <PropertiesPanel
          selectedTable={selectedTable}
          selectedDecor={selectedDecor}
          selectedCount={selectedIds.length}
          onUpdate={updateSelected}
          onRotate={rotateSelected}
          onDelete={deleteSelected}
          onCopy={handleCopy}
          floorPlan={floorPlan}
          onFloorPlanChange={setFloorPlan}
        />
      </div>
    </div>
  );
}

// ─── Панель свойств ───────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selectedTable: TableObject | null;
  selectedDecor: DecorativeObject | null;
  selectedCount: number;
  onUpdate: (u: Partial<FloorPlanObject>) => void;
  onRotate: (d: number) => void;
  onDelete: () => void;
  onCopy: () => void;
  floorPlan: FloorPlan;
  onFloorPlanChange: (fp: FloorPlan) => void;
}

function PropertiesPanel(props: PropertiesPanelProps) {
  const { selectedTable, selectedDecor, selectedCount, onUpdate, onRotate, onDelete, onCopy, floorPlan, onFloorPlanChange } = props;

  if (selectedCount > 1) {
    return (
      <div className="w-60 bg-white border-l border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">
        <MultiSelectPanel count={selectedCount} onCopy={onCopy} onDelete={onDelete} />
      </div>
    );
  }

  return (
    <div className="w-60 bg-white border-l border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">
      {selectedTable ? (
        <TableProperties table={selectedTable} onUpdate={onUpdate} onRotate={onRotate} onDelete={onDelete} />
      ) : selectedDecor ? (
        <DecorProperties decor={selectedDecor} onUpdate={onUpdate} onRotate={onRotate} onDelete={onDelete} />
      ) : (
        <CanvasProperties floorPlan={floorPlan} onChange={onFloorPlanChange} />
      )}
    </div>
  );
}

// ─── Панель мульти-выделения ──────────────────────────────────────────────────

function MultiSelectPanel({ count, onCopy, onDelete }: { count: number; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm">
          {count}
        </div>
        <div>
          <h3 className="font-medium text-gray-900 text-sm">Выбрано объектов</h3>
          <p className="text-xs text-gray-400">Shift+клик для изменения выбора</p>
        </div>
      </div>

      <SectionDivider label="Действия" />

      <button
        onClick={onCopy}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors"
      >
        📋 Копировать ({count})
      </button>
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition-colors"
      >
        🗑 Удалить ({count})
      </button>

      <SectionDivider label="Горячие клавиши" />
      <div className="text-xs text-gray-400 space-y-1">
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+Z</kbd> — отменить</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+C</kbd> — копировать</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+V</kbd> — вставить</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Delete</kbd> — удалить всё</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Esc</kbd> — снять выделение</p>
      </div>
    </div>
  );
}

// ─── Свойства стола ───────────────────────────────────────────────────────────

function TableProperties({ table, onUpdate, onRotate, onDelete }: {
  table: TableObject;
  onUpdate: (u: Partial<FloorPlanObject>) => void;
  onRotate: (d: number) => void;
  onDelete: () => void;
}) {
  const { restaurant } = useAuth();
  const isPremium = restaurant?.plan === 'PREMIUM';
  const [iconUploading, setIconUploading] = useState(false);
  const [iconError, setIconError] = useState('');

  const handleIconUpload = async (file: File) => {
    setIconError('');
    setIconUploading(true);
    try {
      const token = localStorage.getItem('accessToken') ?? '';
      const res = await fetch(`/api/uploads/icons/presign?contentType=${encodeURIComponent(file.type)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Ошибка'); }
      const json = await res.json();
      const { uploadUrl, publicUrl } = json.data ?? json;
      const s3Res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!s3Res.ok) throw new Error(`Ошибка загрузки в хранилище: ${s3Res.status}`);
      onUpdate({ iconUrl: publicUrl });
    } catch (e: any) {
      setIconError(e.message ?? 'Ошибка загрузки');
    } finally {
      setIconUploading(false);
    }
  };
  const wCm = pxToCm(table.width);
  const hCm = pxToCm(table.height);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 text-sm">Стол {table.label}</h3>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1">
          🗑 Удалить
        </button>
      </div>

      <Field label="Номер / название">
        <input type="text" value={table.label} onChange={(e) => onUpdate({ label: e.target.value })} className="input" maxLength={20} />
      </Field>

      <Field label="Форма">
        <select value={table.shape} onChange={(e) => onUpdate({ shape: e.target.value as any })} className="input">
          <option value="ROUND">Круглый</option>
          <option value="SQUARE">Квадратный</option>
          <option value="RECTANGLE">Прямоугольный</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Мин. гостей">
          <input type="number" min={1} max={table.maxGuests} value={table.minGuests} onChange={(e) => onUpdate({ minGuests: Number(e.target.value) })} className="input" />
        </Field>
        <Field label="Макс. гостей">
          <input type="number" min={table.minGuests} max={50} value={table.maxGuests} onChange={(e) => onUpdate({ maxGuests: Number(e.target.value) })} className="input" />
        </Field>
      </div>

      <Field label="Комментарий">
        <input type="text" value={table.comment || ''} onChange={(e) => onUpdate({ comment: e.target.value })} className="input" placeholder="У окна, VIP..." maxLength={100} />
      </Field>

      <SectionDivider label="Тип посадки" />

      <div className="grid grid-cols-2 gap-1">
        {TABLE_TAGS.map((tag) => {
          const active = (table.tags ?? []).includes(tag.id);
          return (
            <label key={tag.id} className="flex items-center gap-1.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={active}
                onChange={() => {
                  const current = table.tags ?? [];
                  onUpdate({ tags: active ? current.filter((t) => t !== tag.id) : [...current, tag.id] });
                }}
                className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
              />
              <span className="text-xs text-gray-600 group-hover:text-gray-900 leading-tight">
                {tag.icon} {tag.label}
              </span>
            </label>
          );
        })}
      </div>

      <SectionDivider label="Размер (1 см = 1 пиксель)" />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Ширина (см)">
          <input type="number" value={wCm} onChange={(e) => onUpdate({ width: Number(e.target.value) })} className="input" min={30} max={400} />
        </Field>
        <Field label="Высота (см)">
          <input type="number" value={hCm} onChange={(e) => onUpdate({ height: Number(e.target.value) })} className="input" min={30} max={400} />
        </Field>
      </div>
      <p className="text-xs text-gray-400">{wCm} × {hCm} см ({(wCm / 100).toFixed(2)} × {(hCm / 100).toFixed(2)} м)</p>

      <Field label="Поворот">
        <div className="flex items-center gap-2">
          <button onClick={() => onRotate(-90)} className="flex-1 btn-secondary text-xs py-1.5">−90°</button>
          <span className="text-xs text-gray-500 w-10 text-center">{table.rotation}°</span>
          <button onClick={() => onRotate(90)} className="flex-1 btn-secondary text-xs py-1.5">+90°</button>
        </div>
      </Field>

      {isPremium && (
        <>
          <SectionDivider label="Внешний вид стола" />

          {/* Иконка */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Иконка стола</p>
            <div className="grid grid-cols-4 gap-1 mb-1.5">
              {/* Стандарт */}
              <button
                onClick={() => onUpdate({ iconUrl: undefined })}
                title="Стандарт"
                className={`h-10 rounded-lg border text-xs font-medium transition-all ${
                  !table.iconUrl ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'
                }`}
              >
                ABC
              </button>
              {TABLE_ICONS.map((icon) => (
                <button
                  key={icon.id}
                  onClick={() => onUpdate({ iconUrl: icon.dataUrl })}
                  title={icon.label}
                  className={`h-10 rounded-lg border overflow-hidden transition-all ${
                    table.iconUrl === icon.dataUrl ? 'border-blue-500 ring-1 ring-blue-400' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={icon.dataUrl} alt={icon.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Загрузка своей иконки */}
            <label className={`relative flex items-center justify-center gap-1.5 w-full py-1.5 border border-dashed rounded-lg text-xs cursor-pointer transition-all ${
              iconUploading ? 'border-blue-300 text-blue-400 bg-blue-50' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'
            }`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="hidden"
                disabled={iconUploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIconUpload(f); e.target.value = ''; }}
              />
              {iconUploading ? '⏳ Загрузка...' : '📤 Загрузить свою (PNG/SVG)'}
            </label>

            {/* Показываем кастомную иконку + кнопку сброса */}
            {table.iconUrl && !TABLE_ICONS.some((i) => i.dataUrl === table.iconUrl) && (
              <div className="mt-1.5 flex items-center gap-2 p-1.5 bg-gray-50 rounded-lg border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={table.iconUrl} alt="Иконка" className="w-10 h-10 rounded object-cover border border-gray-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-500 truncate">Своя иконка</p>
                </div>
                <button onClick={() => onUpdate({ iconUrl: undefined })} className="text-xs text-red-400 hover:text-red-600" title="Удалить">✕</button>
              </div>
            )}
            {iconError && <p className="text-[10px] text-red-500 mt-1">{iconError}</p>}
          </div>

          {/* Цвет заливки */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Цвет заливки</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={table.customFill ?? '#dcfce7'}
                onChange={(e) => onUpdate({ customFill: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"
              />
              {table.customFill && (
                <button
                  onClick={() => onUpdate({ customFill: undefined })}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Сбросить"
                >✕</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Свойства декора ──────────────────────────────────────────────────────────

function DecorProperties({ decor, onUpdate, onRotate, onDelete }: {
  decor: DecorativeObject;
  onUpdate: (u: Partial<FloorPlanObject>) => void;
  onRotate: (d: number) => void;
  onDelete: () => void;
}) {
  const { restaurant } = useAuth();
  const isPremium = restaurant?.plan === 'PREMIUM';
  const wM = pxToM(decor.width);
  const hM = pxToM(decor.height);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 text-sm">{DECOR_LABELS[decor.type] || decor.type}</h3>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1">🗑 Удалить</button>
      </div>

      <SectionDivider label="Размер (1 м = 100 пикселей)" />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Ширина (м)">
          <input
            type="number"
            step="0.1"
            value={Number(wM)}
            onChange={(e) => onUpdate({ width: mToPx(Number(e.target.value)) })}
            className="input"
            min={0.1}
            max={20}
          />
        </Field>
        <Field label="Высота (м)">
          <input
            type="number"
            step="0.1"
            value={Number(hM)}
            onChange={(e) => onUpdate({ height: mToPx(Number(e.target.value)) })}
            className="input"
            min={0.1}
            max={20}
          />
        </Field>
      </div>
      <p className="text-xs text-gray-400">{decor.width} × {decor.height} px ({wM} × {hM} м)</p>

      <Field label="Поворот">
        <div className="flex items-center gap-2">
          <button onClick={() => onRotate(-90)} className="flex-1 btn-secondary text-xs py-1.5">−90°</button>
          <span className="text-xs text-gray-500 w-10 text-center">{decor.rotation}°</span>
          <button onClick={() => onRotate(90)} className="flex-1 btn-secondary text-xs py-1.5">+90°</button>
        </div>
      </Field>

      {isPremium && (
        <>
          <SectionDivider label="Цвет элемента" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Заливка</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={decor.customFill ?? '#e5e7eb'}
                onChange={(e) => onUpdate({ customFill: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"
              />
              {decor.customFill && (
                <button
                  onClick={() => onUpdate({ customFill: undefined })}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Сброс"
                >✕</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Свойства холста / зала ───────────────────────────────────────────────────

function CanvasProperties({ floorPlan, onChange }: { floorPlan: FloorPlan; onChange: (fp: FloorPlan) => void }) {
  const { restaurant } = useAuth();
  const isPremium = restaurant?.plan === 'PREMIUM';
  const wM = Number(pxToM(floorPlan.width));
  const hM = Number(pxToM(floorPlan.height));

  const updateTheme = (updates: Partial<FloorTheme>) => {
    onChange({ ...floorPlan, theme: { ...floorPlan.theme, ...updates } });
  };

  const applyPreset = (p: typeof HALL_THEME_PRESETS[number]) => {
    onChange({
      ...floorPlan,
      theme: { preset: p.id, bgColor: p.bgColor, bgPattern: p.bgPattern as any, tableStyle: { fill: p.table.fill, stroke: p.table.stroke, text: p.table.text } },
    });
  };

  const resetTheme = () => onChange({ ...floorPlan, theme: undefined });

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-medium text-gray-900 text-sm">Размер зала</h3>
      <p className="text-xs text-gray-400 leading-relaxed">
        Выберите объект на схеме или кликните инструментом, чтобы добавить новый элемент.
      </p>

      <SectionDivider label="Размеры (метры)" />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Ширина (м)">
          <input
            type="number"
            step="0.5"
            value={wM}
            min={4}
            max={50}
            onChange={(e) => onChange({ ...floorPlan, width: mToPx(Number(e.target.value)) })}
            className="input"
          />
        </Field>
        <Field label="Глубина (м)">
          <input
            type="number"
            step="0.5"
            value={hM}
            min={3}
            max={50}
            onChange={(e) => onChange({ ...floorPlan, height: mToPx(Number(e.target.value)) })}
            className="input"
          />
        </Field>
      </div>
      <p className="text-xs text-gray-400">
        {wM} × {hM} м · {floorPlan.width} × {floorPlan.height} px
      </p>
      <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
        Масштаб: 1 пиксель = 1 см
      </p>

      <SectionDivider label="Оформление зала" />

      {!isPremium ? (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-center space-y-1.5">
          <p className="text-2xl">🎨</p>
          <p className="text-xs font-medium text-purple-800">Кастомизация визуала</p>
          <p className="text-xs text-purple-600 leading-relaxed">
            Цвета зала, стиль столов и стен — доступны на тарифе Premium
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-block mt-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            Перейти к тарифам →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Пресеты */}
          <div className="grid grid-cols-3 gap-1.5">
            {HALL_THEME_PRESETS.map((p) => {
              const active = floorPlan.theme?.preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  title={p.label}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border text-xs transition-all ${
                    active ? 'border-blue-500 ring-1 ring-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span
                    className="w-full h-5 rounded"
                    style={{ background: `linear-gradient(135deg, ${p.bgColor} 50%, ${p.table.fill} 50%)` }}
                  />
                  <span className="text-[10px] text-gray-600 leading-none">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Текстура пола */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Текстура пола</p>
            <div className="grid grid-cols-3 gap-1">
              {PATTERN_OPTIONS.map((p) => {
                const active = (floorPlan.theme?.bgPattern ?? 'none') === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => updateTheme({ bgPattern: p.id as any })}
                    className={`flex flex-col items-center gap-0.5 p-1 rounded-lg border text-[10px] transition-all ${
                      active ? 'border-blue-500 ring-1 ring-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="w-full h-4 rounded-sm border border-gray-100"
                      style={{ background: p.preview }} />
                    <span className="text-gray-600">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Размер и поворот текстуры — показываем только когда выбрана текстура */}
          {floorPlan.theme?.bgPattern && floorPlan.theme.bgPattern !== 'none' && (
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Размер плитки</p>
                <div className="flex gap-1">
                  {([0.5, 0.75, 1, 1.5, 2, 3] as const).map((s) => {
                    const labels: Record<number, string> = { 0.5: 'XS', 0.75: 'S', 1: 'M', 1.5: 'L', 2: 'XL', 3: '2×' };
                    const active = (floorPlan.theme?.patternScale ?? 1) === s;
                    return (
                      <button key={s} onClick={() => updateTheme({ patternScale: s })}
                        className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                          active ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {labels[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Поворот текстуры</p>
                <div className="flex gap-1">
                  {[0, 45, 90, 135].map((r) => {
                    const active = (floorPlan.theme?.patternRotation ?? 0) === r;
                    return (
                      <button key={r} onClick={() => updateTheme({ patternRotation: r })}
                        className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                          active ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {r}°
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Кастомные цвета */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Цвет пола</span>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={floorPlan.theme?.bgColor ?? '#ffffff'}
                  onChange={(e) => updateTheme({ preset: undefined, bgColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"
                  title="Цвет фона зала"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Цвет свободных столов</span>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={floorPlan.theme?.tableStyle?.fill ?? '#dcfce7'}
                  onChange={(e) => updateTheme({
                    preset: undefined,
                    tableStyle: {
                      fill: e.target.value,
                      stroke: floorPlan.theme?.tableStyle?.stroke ?? '#86efac',
                      text: floorPlan.theme?.tableStyle?.text ?? '#166534',
                    },
                  })}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"
                  title="Цвет заливки свободных столов"
                />
              </div>
            </div>
          </div>

          {floorPlan.theme && (
            <button
              onClick={resetTheme}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              Сбросить оформление
            </button>
          )}
        </div>
      )}

      <SectionDivider label="Горячие клавиши" />
      <div className="text-xs text-gray-400 space-y-1">
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+Z</kbd> — отменить</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+C</kbd> — копировать</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Ctrl+V</kbd> — вставить</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Shift+клик</kbd> — выбрать несколько</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Delete</kbd> — удалить объект</p>
        <p><kbd className="bg-white border border-gray-200 px-1 rounded">Esc</kbd> — снять выделение</p>
        <p>Тащите объект мышью для перемещения</p>
        <p>Тащите углы / стороны для масштабирования</p>
      </div>
    </div>
  );
}

// ─── Вспомогательные ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[10px] text-gray-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}
