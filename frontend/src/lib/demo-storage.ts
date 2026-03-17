import type { FloorPlan } from '@/types';

const DEMO_KEY = 'nakryto_demo_floor_plan';
const DEMO_EXPIRY_DAYS = 5;

interface DemoData {
  floorPlan: FloorPlan;
  savedAt: string;
}

export const DEMO_INITIAL_FLOOR_PLAN: FloorPlan = {
  width: 800,
  height: 600,
  objects: [
    // Стены
    { type: 'wall' as any, id: 'dw1', x: 0,   y: 0,   width: 800, height: 18,  rotation: 0, label: '' },
    { type: 'wall' as any, id: 'dw2', x: 0,   y: 0,   width: 18,  height: 600, rotation: 0, label: '' },
    { type: 'wall' as any, id: 'dw3', x: 782, y: 0,   width: 18,  height: 600, rotation: 0, label: '' },
    { type: 'wall' as any, id: 'dw4', x: 0,   y: 582, width: 800, height: 18,  rotation: 0, label: '' },
    // Бар и вход
    { type: 'bar'      as any, id: 'db1', x: 28,  y: 28,  width: 260, height: 70, rotation: 0, label: 'Бар' },
    { type: 'entrance' as any, id: 'de1', x: 350, y: 555, width: 100, height: 20, rotation: 0, label: 'Вход' },
    // Столы — 8 штук
    { type: 'table', id: 'dt1', label: '1', shape: 'ROUND',     x: 100, y: 160, width: 80,  height: 80,  rotation: 0, minGuests: 1, maxGuests: 2 },
    { type: 'table', id: 'dt2', label: '2', shape: 'ROUND',     x: 220, y: 160, width: 80,  height: 80,  rotation: 0, minGuests: 1, maxGuests: 2 },
    { type: 'table', id: 'dt3', label: '3', shape: 'ROUND',     x: 340, y: 160, width: 80,  height: 80,  rotation: 0, minGuests: 1, maxGuests: 2 },
    { type: 'table', id: 'dt4', label: '4', shape: 'SQUARE',    x: 480, y: 140, width: 100, height: 100, rotation: 0, minGuests: 2, maxGuests: 4 },
    { type: 'table', id: 'dt5', label: '5', shape: 'SQUARE',    x: 620, y: 140, width: 100, height: 100, rotation: 0, minGuests: 2, maxGuests: 4 },
    { type: 'table', id: 'dt6', label: '6', shape: 'RECTANGLE', x: 80,  y: 330, width: 140, height: 90,  rotation: 0, minGuests: 2, maxGuests: 6 },
    { type: 'table', id: 'dt7', label: '7', shape: 'RECTANGLE', x: 280, y: 330, width: 140, height: 90,  rotation: 0, minGuests: 2, maxGuests: 6 },
    { type: 'table', id: 'dt8', label: '8', shape: 'RECTANGLE', x: 480, y: 330, width: 220, height: 90,  rotation: 0, minGuests: 4, maxGuests: 10 },
  ],
};

export function loadDemoFloorPlan(): FloorPlan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const data: DemoData = JSON.parse(raw);
    const expiryMs = DEMO_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(data.savedAt).getTime() > expiryMs) {
      localStorage.removeItem(DEMO_KEY);
      return null;
    }
    return data.floorPlan;
  } catch {
    return null;
  }
}

export function saveDemoFloorPlan(floorPlan: FloorPlan): void {
  if (typeof window === 'undefined') return;
  const data: DemoData = { floorPlan, savedAt: new Date().toISOString() };
  localStorage.setItem(DEMO_KEY, JSON.stringify(data));
}
