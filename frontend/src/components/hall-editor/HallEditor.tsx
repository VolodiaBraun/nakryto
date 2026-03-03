'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Hall, FloorPlan, FloorPlanObject, TableObject, DecorativeObject } from '@/types';
import { TABLE_TAGS } from '@/lib/tableTags';
import { v4 as uuidv4 } from 'uuid';

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
  'table-round':     { width: 80,  height: 80  },  // 80×80 см
  'table-square':    { width: 80,  height: 80  },  // 80×80 см
  'table-rectangle': { width: 120, height: 80  },  // 120×80 см
  wall:              { width: 200, height: 20  },  // 2 м × 20 см
  window:            { width: 100, height: 15  },  // 1 м × 15 см
  column:            { width: 40,  height: 40  },  // 40×40 см
  bar:               { width: 250, height: 60  },  // 2.5 м × 60 см
  entrance:          { width: 80,  height: 20  },  // 80 см × 20 см
  toilet:            { width: 120, height: 100 },  // 1.2 м × 1 м
  stairs:            { width: 120, height: 80  },  // 1.2 м × 80 см
  stage:             { width: 300, height: 120 },  // 3 м × 1.2 м
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const tableCounter = useRef(floorPlan.objects.filter((o) => o.type === 'table').length + 1);

  const selectedObject = floorPlan.objects.find((o) => o.id === selectedId) || null;
  const selectedTable = selectedObject?.type === 'table' ? (selectedObject as TableObject) : null;
  const selectedDecor = selectedObject && selectedObject.type !== 'table' ? (selectedObject as DecorativeObject) : null;

  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (activeTool === 'select') return;
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
      setFloorPlan((prev) => ({ ...prev, objects: [...prev.objects, newTable] }));
    } else {
      const newDecor: DecorativeObject = {
        type: activeTool as any, id,
        x: Math.round(x - size.width / 2),
        y: Math.round(y - size.height / 2),
        width: size.width, height: size.height, rotation: 0,
        label: DECOR_LABELS[activeTool] || activeTool,
      };
      setFloorPlan((prev) => ({ ...prev, objects: [...prev.objects, newDecor] }));
    }
    setSelectedId(id);
    setActiveTool('select');
  }, [activeTool]);

  const handleObjectMove = useCallback((id: string, x: number, y: number) => {
    setFloorPlan((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === id ? { ...o, x: Math.round(x), y: Math.round(y) } : o),
    }));
  }, []);

  const handleObjectTransform = useCallback((id: string, x: number, y: number, width: number, height: number, rotation: number) => {
    setFloorPlan((prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === id ? { ...o, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), rotation: Math.round(rotation) } : o,
      ),
    }));
  }, []);

  const updateSelected = (updates: Partial<FloorPlanObject>) => {
    if (!selectedId) return;
    setFloorPlan((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === selectedId ? { ...o, ...updates } : o) as any,
    }));
  };

  const rotateSelected = (deg: number) => {
    if (!selectedObject) return;
    const cur = selectedObject.rotation || 0;
    setFloorPlan((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === selectedId ? { ...o, rotation: (cur + deg + 360) % 360 } : o),
    }));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setFloorPlan((prev) => ({ ...prev, objects: prev.objects.filter((o) => o.id !== selectedId) }));
    setSelectedId(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') deleteSelected();
      }
      if (e.key === 'Escape') { setSelectedId(null); setActiveTool('select'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

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
        {/* Left Toolbar — с подписями */}
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
            selectedId={selectedId}
            activeTool={activeTool}
            onSelect={setSelectedId}
            onCanvasClick={handleCanvasClick}
            onObjectMove={handleObjectMove}
            onObjectTransform={handleObjectTransform}
          />
        </div>

        {/* Right Panel */}
        <PropertiesPanel
          selectedTable={selectedTable}
          selectedDecor={selectedDecor}
          onUpdate={updateSelected}
          onRotate={rotateSelected}
          onDelete={deleteSelected}
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
  onUpdate: (u: Partial<FloorPlanObject>) => void;
  onRotate: (d: number) => void;
  onDelete: () => void;
  floorPlan: FloorPlan;
  onFloorPlanChange: (fp: FloorPlan) => void;
}

function PropertiesPanel(props: PropertiesPanelProps) {
  const { selectedTable, selectedDecor, onUpdate, onRotate, onDelete, floorPlan, onFloorPlanChange } = props;
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

// ─── Свойства стола ───────────────────────────────────────────────────────────

function TableProperties({ table, onUpdate, onRotate, onDelete }: {
  table: TableObject;
  onUpdate: (u: Partial<FloorPlanObject>) => void;
  onRotate: (d: number) => void;
  onDelete: () => void;
}) {
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
    </div>
  );
}

// ─── Свойства холста / зала ───────────────────────────────────────────────────

function CanvasProperties({ floorPlan, onChange }: { floorPlan: FloorPlan; onChange: (fp: FloorPlan) => void }) {
  const wM = Number(pxToM(floorPlan.width));
  const hM = Number(pxToM(floorPlan.height));

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

      <SectionDivider label="Горячие клавиши" />
      <div className="text-xs text-gray-400 space-y-1">
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
