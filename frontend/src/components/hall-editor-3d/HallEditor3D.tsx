'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Hall, Table } from '@/types';
import type { Hall3DPlan, Vec2, WallElement, WallElementType } from './types3d';
import { DEFAULT_PLAN, WALL_ELEMENT_META } from './types3d';

const Scene3D = dynamic(
  () => import('./Scene3D').then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Загрузка 3D...</p>
        </div>
      </div>
    ),
  },
);

type EditorMode = 'draw' | 'addWallElement' | 'view';

function loadPlan(hallId: string): Hall3DPlan {
  if (typeof window === 'undefined') return { ...DEFAULT_PLAN };
  try {
    const saved = localStorage.getItem(`hall3d_${hallId}`);
    if (!saved) return { ...DEFAULT_PLAN };
    const parsed = JSON.parse(saved) as Hall3DPlan;
    if (parsed.wallThickness === undefined) parsed.wallThickness = 0.3;
    if (!parsed.lightSettings) parsed.lightSettings = { ambientIntensity: 0.55, mainIntensity: 1.1 };
    if (!parsed.tablePositions) parsed.tablePositions = {};
    return parsed;
  } catch {
    return { ...DEFAULT_PLAN };
  }
}

export function HallEditor3D({ hall }: { hall: Hall }) {
  const [plan, setPlan] = useState<Hall3DPlan>(() => loadPlan(hall.id));
  const [mode, setMode] = useState<EditorMode>(() => plan.polygon.length >= 3 ? 'view' : 'draw');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [pendingWallElement, setPendingWallElement] = useState<WallElementType | null>(null);

  const savePlan = useCallback((next: Hall3DPlan) => {
    setPlan(next);
    try { localStorage.setItem(`hall3d_${hall.id}`, JSON.stringify(next)); } catch {}
  }, [hall.id]);

  const handlePolygonClose = useCallback((polygon: Vec2[]) => {
    savePlan({ ...plan, polygon });
    setMode('view');
  }, [plan, savePlan]);

  const handleWallElementAdd = useCallback((el: Omit<WallElement, 'id'>) => {
    const newEl: WallElement = { ...el, id: crypto.randomUUID() };
    savePlan({ ...plan, wallElements: [...plan.wallElements, newEl] });
    setPendingWallElement(null);
    setMode('view');
  }, [plan, savePlan]);

  const handleElementUpdate = useCallback(
    (id: string, patch: Partial<Pick<WallElement, 'offsetAlong' | 'heightFromFloor'>>) => {
      setPlan((prev) => {
        const next = { ...prev, wallElements: prev.wallElements.map((e) => e.id === id ? { ...e, ...patch } : e) };
        try { localStorage.setItem(`hall3d_${hall.id}`, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [hall.id],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElement) return;
    savePlan({ ...plan, wallElements: plan.wallElements.filter((e) => e.id !== selectedElement) });
    setSelectedElement(null);
  }, [plan, savePlan, selectedElement]);

  const handleTableMove = useCallback((id: string, x: number, z: number) => {
    setPlan((prev) => {
      const next = { ...prev, tablePositions: { ...prev.tablePositions, [id]: { x, z } } };
      try { localStorage.setItem(`hall3d_${hall.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [hall.id]);

  const handleResetTablePosition = useCallback((id: string) => {
    setPlan((prev) => {
      const { [id]: _, ...rest } = prev.tablePositions ?? {};
      const next = { ...prev, tablePositions: rest };
      try { localStorage.setItem(`hall3d_${hall.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [hall.id]);

  const startAddWallElement = useCallback((type: WallElementType) => {
    setPendingWallElement(type);
    setMode('addWallElement');
    setSelectedElement(null);
    setSelectedTable(null);
  }, []);

  const handleReset = useCallback(() => {
    if (!confirm('Сбросить 3D схему зала?')) return;
    savePlan({ ...DEFAULT_PLAN });
    setMode('draw');
    setSelectedElement(null);
    setSelectedTable(null);
  }, [savePlan]);

  const isClosed = plan.polygon.length >= 3;
  const selectedEl = selectedElement ? plan.wallElements.find((e) => e.id === selectedElement) : null;
  const selectedTableObj: Table | undefined = selectedTable ? (hall.tables ?? []).find((t) => t.id === selectedTable) : undefined;
  const hasTableOverride = selectedTable && plan.tablePositions?.[selectedTable];

  return (
    <div className="flex h-full bg-gray-900 text-white text-sm">
      {/* ── Left panel ── */}
      <aside className="w-58 flex-shrink-0 bg-gray-800 flex flex-col overflow-y-auto" style={{ width: '14.5rem' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700">
          <Link href={`/dashboard/halls/${hall.id}`} className="text-gray-400 hover:text-white text-xs mb-1 flex items-center gap-1">← 2D редактор</Link>
          <div className="font-semibold truncate">{hall.name}</div>
          <div className="text-xs text-yellow-400 mt-0.5">β 3D — тест</div>
        </div>

        {/* Mode */}
        <div className="px-4 py-3 border-b border-gray-700 space-y-1.5">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Режим</div>
          <button
            className={`w-full px-3 py-2 rounded text-left transition-colors ${mode === 'draw' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            onClick={() => { setMode('draw'); setSelectedElement(null); setSelectedTable(null); }}
          >✏️ Нарисовать контур</button>
          {isClosed && (
            <button
              className={`w-full px-3 py-2 rounded text-left transition-colors ${mode === 'view' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              onClick={() => { setMode('view'); setPendingWallElement(null); }}
            >👁 Просмотр / вращение</button>
          )}
        </div>

        {/* Wall elements */}
        {isClosed && (
          <div className="px-4 py-3 border-b border-gray-700 space-y-1.5">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Добавить на стену</div>
            {(Object.entries(WALL_ELEMENT_META) as [WallElementType, typeof WALL_ELEMENT_META[WallElementType]][]).map(([type, meta]) => (
              <button key={type}
                className={`w-full px-3 py-2 rounded text-left transition-colors ${mode === 'addWallElement' && pendingWallElement === type ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => startAddWallElement(type)}
              >{meta.icon} {meta.label}</button>
            ))}
          </div>
        )}

        {/* Selected wall element */}
        {selectedEl && (
          <div className="px-4 py-3 border-b border-gray-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Выбрано</div>
            <div className="text-xs text-gray-300 mb-1">{WALL_ELEMENT_META[selectedEl.type].icon} {WALL_ELEMENT_META[selectedEl.type].label}</div>
            <div className="text-xs text-gray-500 mb-3">Выделите и тащите для перемещения</div>
            <button className="w-full px-3 py-2 rounded bg-red-700 hover:bg-red-600 transition-colors" onClick={handleDeleteSelected}>
              🗑 Удалить
            </button>
          </div>
        )}

        {/* Selected table */}
        {selectedTableObj && (
          <div className="px-4 py-3 border-b border-gray-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Стол {selectedTableObj.label}</div>
            <div className="text-xs text-gray-400 mb-1">{selectedTableObj.minGuests}–{selectedTableObj.maxGuests} гостей</div>
            {plan.tablePositions?.[selectedTableObj.id] ? (
              <div className="text-xs text-gray-500 mb-2">
                X: {plan.tablePositions[selectedTableObj.id].x.toFixed(1)},
                Z: {plan.tablePositions[selectedTableObj.id].z.toFixed(1)}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mb-2">Позиция из 2D редактора</div>
            )}
            <div className="text-xs text-blue-400 mb-2">Выделите и тащите для перемещения</div>
            {hasTableOverride && (
              <button className="w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-xs"
                onClick={() => handleResetTablePosition(selectedTableObj.id)}>
                ↩ Сбросить позицию
              </button>
            )}
          </div>
        )}

        {/* Visual settings */}
        {isClosed && (
          <div className="px-4 py-3 border-b border-gray-700 space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Оформление</div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Пол</span>
              <input type="color" value={plan.floorColor}
                onChange={(e) => savePlan({ ...plan, floorColor: e.target.value })}
                className="w-full h-8 rounded cursor-pointer border-0 bg-transparent" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Стены</span>
              <input type="color" value={plan.wallColor}
                onChange={(e) => savePlan({ ...plan, wallColor: e.target.value })}
                className="w-full h-8 rounded cursor-pointer border-0 bg-transparent" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Высота стен: {plan.wallHeight.toFixed(1)}м</span>
              <input type="range" min="2" max="6" step="0.5" value={plan.wallHeight}
                onChange={(e) => savePlan({ ...plan, wallHeight: +e.target.value })}
                className="w-full accent-blue-500" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Толщина стен: {(plan.wallThickness ?? 0.3).toFixed(2)}м</span>
              <input type="range" min="0.1" max="1.0" step="0.05" value={plan.wallThickness ?? 0.3}
                onChange={(e) => savePlan({ ...plan, wallThickness: +e.target.value })}
                className="w-full accent-blue-500" />
            </label>
          </div>
        )}

        {/* Light controls */}
        {isClosed && (
          <div className="px-4 py-3 border-b border-gray-700 space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">💡 Освещение</div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">
                Рассеянный свет: {plan.lightSettings.ambientIntensity.toFixed(2)}
              </span>
              <input type="range" min="0" max="1.5" step="0.05"
                value={plan.lightSettings.ambientIntensity}
                onChange={(e) => savePlan({ ...plan, lightSettings: { ...plan.lightSettings, ambientIntensity: +e.target.value } })}
                className="w-full accent-yellow-400" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">
                Основной свет: {plan.lightSettings.mainIntensity.toFixed(2)}
              </span>
              <input type="range" min="0" max="2.5" step="0.1"
                value={plan.lightSettings.mainIntensity}
                onChange={(e) => savePlan({ ...plan, lightSettings: { ...plan.lightSettings, mainIntensity: +e.target.value } })}
                className="w-full accent-yellow-400" />
            </label>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
          {isClosed && (
            <>
              <div>
                {plan.polygon.length === 4 ? (() => {
                  const xs = plan.polygon.map(p => p.x), zs = plan.polygon.map(p => p.y);
                  return `Размер: ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} × ${(Math.max(...zs) - Math.min(...zs)).toFixed(1)} м`;
                })() : `Вершин: ${plan.polygon.length}`}
              </div>
              <div>Элементов стен: {plan.wallElements.length}</div>
              <div>Столов перемещено: {Object.keys(plan.tablePositions ?? {}).length}</div>
            </>
          )}
          <div>Всего столов: {hall.tables?.length ?? 0}</div>
        </div>

        {/* Reset */}
        <div className="mt-auto px-4 py-3 border-t border-gray-700">
          <button className="w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-xs text-gray-300" onClick={handleReset}>
            🔄 Сбросить схему
          </button>
        </div>
      </aside>

      {/* ── 3D Canvas ── */}
      <div className="flex-1 relative overflow-hidden">
        {mode === 'draw' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-blue-700/90 backdrop-blur text-white px-4 py-2 rounded-full text-xs shadow-lg pointer-events-none">
            Зажмите и протяните мышью чтобы нарисовать комнату
          </div>
        )}
        {mode === 'addWallElement' && pendingWallElement && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-green-700/90 backdrop-blur text-white px-4 py-2 rounded-full text-xs shadow-lg pointer-events-none">
            {WALL_ELEMENT_META[pendingWallElement].icon} Кликните на стену
          </div>
        )}
        {mode === 'view' && !selectedEl && !selectedTableObj && (
          <div className="absolute bottom-4 right-4 z-10 text-xs text-gray-500 pointer-events-none">
            ЛКМ — вращение · ПКМ — перемещение · колёсико — зум
          </div>
        )}
        {(selectedEl || selectedTableObj) && (
          <div className="absolute bottom-4 right-4 z-10 text-xs text-blue-400 pointer-events-none">
            Кликните на выделенный объект и тащите
          </div>
        )}

        <Scene3D
          plan={plan}
          tables={hall.tables ?? []}
          mode={mode}
          selectedElement={selectedElement}
          selectedTable={selectedTable}
          pendingWallElement={pendingWallElement}
          onPolygonClose={handlePolygonClose}
          onWallElementAdd={handleWallElementAdd}
          onElementSelect={(id) => { setSelectedElement(id); if (id) setSelectedTable(null); }}
          onElementUpdate={handleElementUpdate}
          onTableSelect={(id) => { setSelectedTable(id); if (id) setSelectedElement(null); }}
          onTableMove={handleTableMove}
        />
      </div>
    </div>
  );
}
