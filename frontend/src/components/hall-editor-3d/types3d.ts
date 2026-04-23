export interface Vec2 {
  x: number;
  y: number;
}

export type WallElementType = 'window' | 'door' | 'artwork' | 'lamp';

export interface WallElement {
  id: string;
  type: WallElementType;
  wallIndex: number;
  offsetAlong: number; // 0..1 along the wall edge
  heightFromFloor: number; // in scene units
  width: number;
  height: number;
  textureUrl?: string;
}

export interface FloorLayer {
  id: string;
  x: number; z: number;      // позиция центра в единицах сцены
  width: number; height: number; // размер в метрах
  textureUrl: string;
  repeat: { x: number; y: number };
}

export interface LightSettings {
  ambientIntensity: number;
  mainIntensity: number;
}

export interface Hall3DPlan {
  polygon: Vec2[];
  wallHeight: number;
  wallThickness: number;
  floorColor: string;
  wallColor: string;
  wallElements: WallElement[];
  lightSettings: LightSettings;
  tablePositions: Record<string, { x: number; z: number }>; // overrides per table.id
  floorTextureUrl?: string;
  floorTextureRepeat?: { x: number; y: number };
  wallTextures?: Record<number, string>;
  tableIcons?: Record<string, string>;
  tableColors?: Record<string, string>;
  tableSizeOverrides?: Record<string, { w: number; h: number }>;
  floorLayers?: FloorLayer[];
}

export const DEFAULT_PLAN: Hall3DPlan = {
  polygon: [],
  wallHeight: 3.0,
  wallThickness: 0.3,
  floorColor: '#c8a97e',
  wallColor: '#f0ebe0',
  wallElements: [],
  lightSettings: { ambientIntensity: 0.55, mainIntensity: 1.1 },
  tablePositions: {},
};

export const WALL_ELEMENT_META: Record<WallElementType, { label: string; icon: string; color: string; defaultW: number; defaultH: number }> = {
  window:  { label: 'Окно',      icon: '🪟', color: '#a8d8ea', defaultW: 1.2, defaultH: 1.0 },
  door:    { label: 'Дверь',     icon: '🚪', color: '#c8a06a', defaultW: 0.9, defaultH: 2.1 },
  artwork: { label: 'Картина',   icon: '🖼',  color: '#e8c4a0', defaultW: 1.0, defaultH: 0.8 },
  lamp:    { label: 'Светильник',icon: '💡', color: '#ffe08a', defaultW: 0.4, defaultH: 0.4 },
};
