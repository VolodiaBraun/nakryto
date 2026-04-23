'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Hall, Table } from '@/types';
import type { Hall3DPlan, Vec2, WallElement, WallElementType } from './types3d';
import { DEFAULT_PLAN, WALL_ELEMENT_META } from './types3d';
import { uploadsApi } from '@/lib/api';

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
  const [selectedWall, setSelectedWall] = useState<number | null>(null);
  const [uploadingEl, setUploadingEl] = useState(false);
  const [uploadingFloor, setUploadingFloor] = useState(false);
  const [uploadingWall, setUploadingWall] = useState(false);
  const [uploadingTableIcon, setUploadingTableIcon] = useState(false);
  const [uploadingLayer, setUploadingLayer] = useState(false);

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
    (id: string, patch: Partial<Omit<WallElement, 'id' | 'type' | 'wallIndex'>>) => {
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

  const handleWallSelect = useCallback((index: number | null) => {
    setSelectedWall(index);
    if (index !== null) { setSelectedElement(null); setSelectedTable(null); }
  }, []);

  const startAddWallElement = useCallback((type: WallElementType) => {
    setPendingWallElement(type);
    setMode('addWallElement');
    setSelectedElement(null);
    setSelectedTable(null);
    setSelectedWall(null);
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

  const roomCenter = useMemo(() => {
    if (plan.polygon.length < 3) return { x: 0, z: 0 };
    const xs = plan.polygon.map((p) => p.x);
    const zs = plan.polygon.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  }, [plan.polygon]);

  const selectedElWallLen = useMemo(() => {
    if (!selectedEl) return 10;
    const p1 = plan.polygon[selectedEl.wallIndex];
    const p2 = plan.polygon[(selectedEl.wallIndex + 1) % plan.polygon.length];
    if (!p1 || !p2) return 10;
    const dx = p2.x - p1.x, dz = p2.y - p1.y;
    return Math.sqrt(dx * dx + dz * dz);
  }, [selectedEl, plan.polygon]);

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

        {/* Выбранная стена */}
        {selectedWall !== null && isClosed && (
          <div className="px-4 py-3 border-b border-gray-700 space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Стена {selectedWall + 1} / {plan.polygon.length}
            </div>
            {plan.wallTextures?.[selectedWall] ? (
              <div className="flex items-center gap-2">
                <img src={plan.wallTextures[selectedWall]} alt="" className="w-9 h-9 rounded object-cover border border-gray-600 flex-shrink-0" />
                <button className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  onClick={() => {
                    const { [selectedWall]: _, ...rest } = plan.wallTextures ?? {};
                    savePlan({ ...plan, wallTextures: rest });
                  }}>
                  Убрать текстуру
                </button>
              </div>
            ) : null}
            <label className="cursor-pointer">
              <span className={`inline-block text-xs px-2 py-1 rounded transition-colors ${uploadingWall ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                {uploadingWall ? '⏳ Загрузка...' : '📷 Текстура стены'}
              </span>
              <input type="file" accept="image/*" className="hidden" disabled={uploadingWall}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingWall(true);
                  try {
                    const url = await uploadsApi.uploadPresignOnly(hall.id, file);
                    savePlan({ ...plan, wallTextures: { ...plan.wallTextures, [selectedWall]: url } });
                  } catch {}
                  finally { setUploadingWall(false); e.target.value = ''; }
                }} />
            </label>
            <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setSelectedWall(null)}>
              × Снять выделение
            </button>
          </div>
        )}

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
          <div className="px-4 py-3 border-b border-gray-700 space-y-2.5">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Выбрано: {WALL_ELEMENT_META[selectedEl.type].icon} {WALL_ELEMENT_META[selectedEl.type].label}</div>

            {/* Position */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Позиция (шаг 0.1 м)</div>
              <div className="flex gap-1.5">
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">От края, м</span>
                  <input type="number" step="0.1" min="0"
                    value={parseFloat((selectedEl.offsetAlong * selectedElWallLen).toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 focus:border-blue-500 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && selectedElWallLen > 0)
                        handleElementUpdate(selectedEl.id, { offsetAlong: Math.max(0.05, Math.min(0.95, v / selectedElWallLen)) });
                    }} />
                </label>
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">От пола, м</span>
                  <input type="number" step="0.1" min="0"
                    value={parseFloat(selectedEl.heightFromFloor.toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 focus:border-blue-500 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) handleElementUpdate(selectedEl.id, { heightFromFloor: Math.max(0.1, v) });
                    }} />
                </label>
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Размер</div>
              <div className="flex gap-1.5">
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">Ширина, м</span>
                  <input type="number" step="0.1" min="0.1"
                    value={parseFloat(selectedEl.width.toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 focus:border-blue-500 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) handleElementUpdate(selectedEl.id, { width: v });
                    }} />
                </label>
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">Высота, м</span>
                  <input type="number" step="0.1" min="0.1"
                    value={parseFloat(selectedEl.height.toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 focus:border-blue-500 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) handleElementUpdate(selectedEl.id, { height: v });
                    }} />
                </label>
              </div>
            </div>

            {/* Texture upload */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Текстура</div>
              {selectedEl.textureUrl ? (
                <div className="flex items-center gap-2 mb-1.5">
                  <img src={selectedEl.textureUrl} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 border border-gray-600" />
                  <button className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    onClick={() => handleElementUpdate(selectedEl.id, { textureUrl: undefined })}>
                    Убрать
                  </button>
                </div>
              ) : null}
              <label className="cursor-pointer">
                <span className={`inline-block text-xs px-2 py-1 rounded transition-colors ${uploadingEl ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                  {uploadingEl ? '⏳ Загрузка...' : '📷 Загрузить картинку'}
                </span>
                <input type="file" accept="image/*" className="hidden" disabled={uploadingEl}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedElement) return;
                    setUploadingEl(true);
                    try {
                      const url = await uploadsApi.uploadPresignOnly(hall.id, file);
                      handleElementUpdate(selectedElement, { textureUrl: url });
                    } catch {}
                    finally {
                      setUploadingEl(false);
                      e.target.value = '';
                    }
                  }} />
              </label>
            </div>

            <button className="w-full px-3 py-2 rounded bg-red-700 hover:bg-red-600 transition-colors text-xs" onClick={handleDeleteSelected}>
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

            {/* Размер стола */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Размер в 3D, м</div>
              <div className="flex gap-1.5">
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">Ширина</span>
                  <input type="number" step="0.1" min="0.1"
                    value={parseFloat((plan.tableSizeOverrides?.[selectedTableObj.id]?.w ?? (selectedTableObj.width || 100) * 0.01).toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        const prev = plan.tableSizeOverrides?.[selectedTableObj.id];
                        savePlan({ ...plan, tableSizeOverrides: { ...plan.tableSizeOverrides, [selectedTableObj.id]: { w: v, h: prev?.h ?? (selectedTableObj.height || 100) * 0.01 } } });
                      }
                    }} />
                </label>
                <label className="flex-1 flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">Глубина</span>
                  <input type="number" step="0.1" min="0.1"
                    value={parseFloat((plan.tableSizeOverrides?.[selectedTableObj.id]?.h ?? (selectedTableObj.height || 100) * 0.01).toFixed(1))}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 outline-none"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        const prev = plan.tableSizeOverrides?.[selectedTableObj.id];
                        savePlan({ ...plan, tableSizeOverrides: { ...plan.tableSizeOverrides, [selectedTableObj.id]: { w: prev?.w ?? (selectedTableObj.width || 100) * 0.01, h: v } } });
                      }
                    }} />
                </label>
              </div>
              {plan.tableSizeOverrides?.[selectedTableObj.id] && (
                <button className="text-xs text-gray-500 hover:text-gray-300 mt-1 transition-colors"
                  onClick={() => {
                    const { [selectedTableObj.id]: _, ...rest } = plan.tableSizeOverrides ?? {};
                    savePlan({ ...plan, tableSizeOverrides: rest });
                  }}>
                  ↩ Сбросить размер
                </button>
              )}
            </div>

            {/* Цвет стола (только когда нет иконки) */}
            {!plan.tableIcons?.[selectedTableObj.id] && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Цвет стола</span>
                <div className="flex items-center gap-2">
                  <input type="color"
                    value={plan.tableColors?.[selectedTableObj.id] ?? '#7a5c38'}
                    className="w-full h-8 rounded cursor-pointer border-0 bg-transparent"
                    onChange={(e) => savePlan({ ...plan, tableColors: { ...plan.tableColors, [selectedTableObj.id]: e.target.value } })} />
                  {plan.tableColors?.[selectedTableObj.id] && (
                    <button className="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0 transition-colors"
                      onClick={() => {
                        const { [selectedTableObj.id]: _, ...rest } = plan.tableColors ?? {};
                        savePlan({ ...plan, tableColors: rest });
                      }}>↩</button>
                  )}
                </div>
              </label>
            )}

            {/* Иконка стола */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Иконка стола</div>
              {plan.tableIcons?.[selectedTableObj.id] ? (
                <div className="flex items-center gap-2 mb-1.5">
                  <img src={plan.tableIcons[selectedTableObj.id]} alt="" className="w-9 h-9 rounded object-cover border border-gray-600 flex-shrink-0" />
                  <button className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    onClick={() => {
                      const { [selectedTableObj.id]: _, ...rest } = plan.tableIcons ?? {};
                      savePlan({ ...plan, tableIcons: rest });
                    }}>
                    Убрать
                  </button>
                </div>
              ) : null}
              <label className="cursor-pointer">
                <span className={`inline-block text-xs px-2 py-1 rounded transition-colors ${uploadingTableIcon ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                  {uploadingTableIcon ? '⏳ Загрузка...' : '📷 Загрузить иконку'}
                </span>
                <input type="file" accept="image/*" className="hidden" disabled={uploadingTableIcon}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingTableIcon(true);
                    try {
                      const url = await uploadsApi.uploadPresignOnly(hall.id, file);
                      savePlan({ ...plan, tableIcons: { ...plan.tableIcons, [selectedTableObj.id]: url } });
                    } catch {}
                    finally { setUploadingTableIcon(false); e.target.value = ''; }
                  }} />
              </label>
            </div>

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
            {/* Слои текстур пола */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400">Слои пола</span>
                <label className="cursor-pointer">
                  <span className={`text-xs px-2 py-0.5 rounded transition-colors ${uploadingLayer ? 'bg-gray-600 text-gray-400' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}>
                    {uploadingLayer ? '⏳' : '+ Добавить'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingLayer}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLayer(true);
                      try {
                        const url = await uploadsApi.uploadPresignOnly(hall.id, file);
                        const newLayer = { id: crypto.randomUUID(), x: roomCenter.x, z: roomCenter.z, width: 3, height: 3, textureUrl: url, repeat: { x: 3, y: 3 } };
                        savePlan({ ...plan, floorLayers: [...(plan.floorLayers ?? []), newLayer] });
                      } catch {}
                      finally { setUploadingLayer(false); e.target.value = ''; }
                    }} />
                </label>
              </div>
              {(plan.floorLayers ?? []).length === 0 && (
                <div className="text-xs text-gray-600">Нет слоёв — добавьте текстуру</div>
              )}
              {(plan.floorLayers ?? []).map((layer, idx) => (
                <div key={layer.id} className="bg-gray-750 border border-gray-700 rounded p-2 mb-2 space-y-1.5" style={{ background: '#2a2a3e' }}>
                  <div className="flex items-center gap-2">
                    <img src={layer.textureUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border border-gray-600" />
                    <span className="text-xs text-gray-400 flex-1">Слой {idx + 1}</span>
                    <button className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      onClick={() => savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).filter((l) => l.id !== layer.id) })}>
                      ×
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500">X, м</span>
                      <input type="number" step="0.5"
                        value={parseFloat(layer.x.toFixed(1))}
                        className="w-full bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, x: v } : l) }); }} />
                    </label>
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500">Z, м</span>
                      <input type="number" step="0.5"
                        value={parseFloat(layer.z.toFixed(1))}
                        className="w-full bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, z: v } : l) }); }} />
                    </label>
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500">Ш, м</span>
                      <input type="number" step="0.5" min="0.5"
                        value={parseFloat(layer.width.toFixed(1))}
                        className="w-full bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, width: v } : l) }); }} />
                    </label>
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500">Г, м</span>
                      <input type="number" step="0.5" min="0.5"
                        value={parseFloat(layer.height.toFixed(1))}
                        className="w-full bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, height: v } : l) }); }} />
                    </label>
                  </div>
                  <div className="flex gap-1 items-center">
                    <span className="text-[10px] text-gray-500 flex-shrink-0">Повтор X/Y:</span>
                    <input type="number" step="0.5" min="0.5" max="20"
                      value={parseFloat(layer.repeat.x.toFixed(1))}
                      className="flex-1 bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                      onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, repeat: { x: v, y: l.repeat.y } } : l) }); }} />
                    <input type="number" step="0.5" min="0.5" max="20"
                      value={parseFloat(layer.repeat.y.toFixed(1))}
                      className="flex-1 bg-gray-700 rounded px-1.5 py-0.5 text-xs text-white border border-gray-600 outline-none"
                      onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) savePlan({ ...plan, floorLayers: (plan.floorLayers ?? []).map((l) => l.id === layer.id ? { ...l, repeat: { x: l.repeat.x, y: v } } : l) }); }} />
                  </div>
                </div>
              ))}
            </div>
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
          selectedWall={selectedWall}
          pendingWallElement={pendingWallElement}
          onPolygonClose={handlePolygonClose}
          onWallElementAdd={handleWallElementAdd}
          onElementSelect={(id) => { setSelectedElement(id); if (id) { setSelectedTable(null); setSelectedWall(null); } }}
          onElementUpdate={handleElementUpdate}
          onTableSelect={(id) => { setSelectedTable(id); if (id) { setSelectedElement(null); setSelectedWall(null); } }}
          onTableMove={handleTableMove}
          onWallSelect={handleWallSelect}
        />
      </div>
    </div>
  );
}
