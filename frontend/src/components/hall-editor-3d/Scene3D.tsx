'use client';

import { useMemo, useState, useCallback, useEffect, Suspense } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { Hall3DPlan, Vec2, WallElement, WallElementType, LightSettings, FloorLayer } from './types3d';
import { WALL_ELEMENT_META } from './types3d';
import type { Table } from '@/types';

// ─── Math helpers ─────────────────────────────────────────────────────────────

function wallAngle(p1: Vec2, p2: Vec2) {
  return Math.atan2(-(p2.y - p1.y), p2.x - p1.x);
}

function wallLength(p1: Vec2, p2: Vec2) {
  const dx = p2.x - p1.x, dz = p2.y - p1.y;
  return Math.sqrt(dx * dx + dz * dz);
}

function hitToWallUV(hit: THREE.Vector3, p1: Vec2, p2: Vec2, wallHeight: number) {
  const dx = p2.x - p1.x, dz = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const rel = hit.clone().sub(new THREE.Vector3(cx, wallHeight / 2, cz));
  const edgeDir = new THREE.Vector3(dx / len, 0, dz / len);
  return {
    offsetAlong: Math.max(0.05, Math.min(0.95, (rel.dot(edgeDir) + len / 2) / len)),
    heightFromFloor: Math.max(0.1, Math.min(wallHeight - 0.1, rel.y + wallHeight / 2)),
  };
}

// ─── Camera setup ─────────────────────────────────────────────────────────────

function CameraSetup({ polygon, viewOnly }: { polygon: Vec2[]; viewOnly: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    const xs = polygon.length >= 3 ? polygon.map((p) => p.x) : [0, 10];
    const zs = polygon.length >= 3 ? polygon.map((p) => p.y) : [0, 8];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4);
    camera.position.set(cx, span * (viewOnly ? 1.8 : 1.2), cz + span * (viewOnly ? 0.5 : 1.1));
    camera.lookAt(cx, 0, cz);
  }, []); // run once on mount
  return null;
}

// ─── Textured materials (Suspense-safe) ───────────────────────────────────────

function FloorTextureMaterial({ url, repeat }: { url: string; repeat: { x: number; y: number } }) {
  const texture = useTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  return <meshStandardMaterial map={texture} roughness={0.85} side={THREE.DoubleSide} />;
}

function WallTextureMaterial({ url, selected }: { url: string; selected: boolean }) {
  const texture = useTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return (
    <meshStandardMaterial map={texture} roughness={0.9}
      emissive={selected ? '#aaccff' : '#000000'} emissiveIntensity={selected ? 0.12 : 0} />
  );
}

function TableIconLayer({ url, tw, th }: { url: string; tw: number; th: number }) {
  const texture = useTexture(url);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[tw, th]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function FloorLayerMaterial({ url, repeat }: { url: string; repeat: { x: number; y: number } }) {
  const texture = useTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  return <meshStandardMaterial map={texture} roughness={0.85} transparent />;
}

function ElementTextureMaterial({ url, transparent, opacity, emissive, emissiveIntensity }: {
  url: string; transparent?: boolean; opacity?: number; emissive?: string; emissiveIntensity?: number;
}) {
  const texture = useTexture(url);
  return (
    <meshStandardMaterial map={texture} transparent={transparent} opacity={opacity}
      roughness={0.4} emissive={emissive as THREE.ColorRepresentation} emissiveIntensity={emissiveIntensity} />
  );
}

// ─── Floor ────────────────────────────────────────────────────────────────────

function Floor({ polygon, color, textureUrl, textureRepeat }: { polygon: Vec2[]; color: string; textureUrl?: string; textureRepeat?: { x: number; y: number } }) {
  const geometry = useMemo(() => {
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    polygon.slice(1).forEach((p) => shape.lineTo(p.x, p.y));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [polygon]);

  if (!geometry) return null;

  return (
    // [Math.PI/2] maps shape (x,y) → world (x,0,y) — matches walls at world Z = polygon.y
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      {textureUrl ? (
        <Suspense fallback={<meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />}>
          <FloorTextureMaterial url={textureUrl} repeat={textureRepeat ?? { x: 3, y: 3 }} />
        </Suspense>
      ) : (
        <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
      )}
    </mesh>
  );
}

// ─── Wall (BoxGeometry with thickness) ───────────────────────────────────────
// Walls start at Y=0.002 (bottom face) to avoid z-fighting with floor at Y=0.
// castShadow=false prevents triangular shadow artifacts on the floor.

interface WallProps {
  p1: Vec2; p2: Vec2;
  wallHeight: number; wallThickness: number;
  color: string; wallIndex: number;
  textureUrl?: string;
  interactive: boolean; // addWallElement mode
  selectable: boolean;  // view mode — click to select wall
  selected: boolean;
  onWallClick?: (wallIndex: number, offsetAlong: number, heightFromFloor: number) => void;
  onWallSelect?: (wallIndex: number) => void;
}

function Wall({ p1, p2, wallHeight, wallThickness, color, wallIndex, textureUrl, interactive, selectable, selected, onWallClick, onWallSelect }: WallProps) {
  const [hovered, setHovered] = useState(false);
  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);
  const posY = wallHeight / 2 + 0.002;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (interactive && onWallClick) {
        if (!e.face || Math.abs(e.face.normal.z) < 0.5) return;
        const { offsetAlong, heightFromFloor } = hitToWallUV(e.point, p1, p2, wallHeight);
        onWallClick(wallIndex, offsetAlong, heightFromFloor);
      } else if (selectable && onWallSelect) {
        onWallSelect(wallIndex);
      }
    },
    [p1, p2, wallHeight, wallIndex, interactive, selectable, onWallClick, onWallSelect],
  );

  const baseColor = selected ? '#c8deff'
    : hovered && interactive ? '#d8d4c4'
    : hovered && selectable ? '#ece8da'
    : color;

  return (
    <mesh
      position={[cx, posY, cz]}
      rotation={[0, angle, 0]}
      onClick={handleClick}
      onPointerOver={() => (interactive || selectable) && setHovered(true)}
      onPointerOut={() => setHovered(false)}
      receiveShadow
    >
      <boxGeometry args={[len, wallHeight, wallThickness]} />
      {textureUrl ? (
        <Suspense fallback={<meshStandardMaterial color={baseColor} roughness={0.9} />}>
          <WallTextureMaterial url={textureUrl} selected={selected} />
        </Suspense>
      ) : (
        <meshStandardMaterial color={baseColor} roughness={0.9} />
      )}
    </mesh>
  );
}

// ─── Corner fill ─────────────────────────────────────────────────────────────
// Fills the gap at each polygon vertex where two wall boxes don't overlap.

function WallCorner({ vertex, wallHeight, wallThickness, color }: {
  vertex: Vec2; wallHeight: number; wallThickness: number; color: string;
}) {
  return (
    <mesh position={[vertex.x, wallHeight / 2 + 0.002, vertex.y]} receiveShadow>
      <boxGeometry args={[wallThickness, wallHeight, wallThickness]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// ─── Invisible drag plane on a wall ──────────────────────────────────────────

function WallDragPlane({ wallIndex, polygon, wallHeight, onMove, onEnd }: {
  wallIndex: number; polygon: Vec2[]; wallHeight: number;
  onMove: (o: number, h: number) => void; onEnd: () => void;
}) {
  const p1 = polygon[wallIndex];
  const p2 = polygon[(wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;
  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);
  return (
    <mesh position={[cx, wallHeight / 2, cz]} rotation={[0, angle, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const { offsetAlong, heightFromFloor } = hitToWallUV(e.point, p1, p2, wallHeight);
        // Snap to 0.1m grid
        const snappedO = Math.max(0.05, Math.min(0.95, Math.round(offsetAlong * len / 0.1) * 0.1 / len));
        const snappedH = Math.max(0.1, Math.min(wallHeight - 0.1, Math.round(heightFromFloor / 0.1) * 0.1));
        onMove(snappedO, snappedH);
      }}
      onPointerUp={(e) => { e.stopPropagation(); onEnd(); }}
      onPointerLeave={(e) => { e.stopPropagation(); onEnd(); }}
    >
      <planeGeometry args={[Math.max(len * 4, 60), Math.max(wallHeight * 4, 20)]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Invisible drag plane on the floor (for table dragging) ──────────────────

function FloorDragPlane({ onMove, onEnd }: {
  onMove: (x: number, z: number) => void; onEnd: () => void;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}
      onPointerMove={(e) => { e.stopPropagation(); onMove(e.point.x, e.point.z); }}
      onPointerUp={(e) => { e.stopPropagation(); onEnd(); }}
      onPointerLeave={(e) => { e.stopPropagation(); onEnd(); }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Wall element ─────────────────────────────────────────────────────────────

function WallElementMesh({ element, polygon, wallHeight, wallThickness, selected, onClick, onDragStart }: {
  element: WallElement; polygon: Vec2[]; wallHeight: number; wallThickness: number;
  selected: boolean; onClick: () => void; onDragStart: (wi: number) => void;
}) {
  const p1 = polygon[element.wallIndex];
  const p2 = polygon[(element.wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x, dz = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);
  const edgeDirX = dx / len, edgeDirZ = dz / len;
  const wx = cx + edgeDirX * (element.offsetAlong - 0.5) * len;
  const wy = element.heightFromFloor;
  const wz = cz + edgeDirZ * (element.offsetAlong - 0.5) * len;
  const depth = wallThickness + 0.06;
  const meta = WALL_ELEMENT_META[element.type];

  return (
    // onClick на группе блокирует всплытие к стене (Wall.onClick) при клике на любой дочерний меш
    <group onClick={(e) => e.stopPropagation()}>
      {element.type === 'window' && (
        <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
          <boxGeometry args={[element.width + 0.1, element.height + 0.1, depth]} />
          <meshStandardMaterial color="#c8c0a8" roughness={0.7} />
        </mesh>
      )}
      <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}
        onPointerDown={(e) => { e.stopPropagation(); if (selected) onDragStart(element.wallIndex); else onClick(); }}
      >
        <boxGeometry args={[element.width, element.height, depth]} />
        {element.textureUrl ? (
          <Suspense fallback={<meshStandardMaterial color={meta.color} transparent opacity={element.type === 'window' ? 0.55 : 0.92} roughness={0.4} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.18 : 0} />}>
            <ElementTextureMaterial url={element.textureUrl}
              transparent opacity={element.type === 'window' ? 0.55 : 0.92}
              emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.18 : 0} />
          </Suspense>
        ) : (
          <meshStandardMaterial color={meta.color} transparent opacity={element.type === 'window' ? 0.55 : 0.92}
            roughness={0.4} emissive={selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.18 : 0} />
        )}
      </mesh>
      {element.type === 'window' && (
        <>
          <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.06, element.height + 0.04, depth + 0.01]} />
            <meshStandardMaterial color="#a89880" />
          </mesh>
          <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
            <boxGeometry args={[element.width + 0.04, 0.06, depth + 0.01]} />
            <meshStandardMaterial color="#a89880" />
          </mesh>
        </>
      )}
      {element.type === 'lamp' && (
        <pointLight position={[wx, wy - 0.3, wz]} color="#ffe8a0" intensity={0.9} distance={5} />
      )}
      {selected && (
        <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
          <boxGeometry args={[element.width + 0.2, element.height + 0.2, depth + 0.02]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function Table3D({ table, scale, positionOverride, sizeOverride, iconUrl, tableColor, selected, onSelect, onDragStart }: {
  table: Table; scale: number;
  positionOverride?: { x: number; z: number };
  sizeOverride?: { w: number; h: number };
  iconUrl?: string;
  tableColor?: string;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
}) {
  const x = positionOverride ? positionOverride.x : table.positionX * scale;
  const z = positionOverride ? positionOverride.z : table.positionY * scale;
  const w = sizeOverride ? sizeOverride.w : (table.width || 100) * scale;
  const h = sizeOverride ? sizeOverride.h : (table.height || 100) * scale;
  const H = 0.08;
  // Если есть иконка — нейтральный цвет (иконка покрывает весь верх), иначе — настраиваемый
  const baseColor = iconUrl ? '#e8e4de' : (tableColor ?? '#7a5c38');
  const activeColor = iconUrl ? '#ccc8c0' : '#a07040';
  const tableMat = (
    <meshStandardMaterial color={selected ? activeColor : baseColor} roughness={0.6}
      emissive={selected ? '#ff9900' : '#000000'} emissiveIntensity={selected ? 0.15 : 0} />
  );

  return (
    <group position={[x, 0, z]}>
      {table.shape === 'ROUND' ? (
        <mesh position={[0, H / 2, 0]} castShadow receiveShadow
          onPointerDown={(e) => { e.stopPropagation(); if (selected) onDragStart(); else onSelect(); }}
        >
          <cylinderGeometry args={[Math.min(w, h) / 2, Math.min(w, h) / 2, H, 24]} />
          {tableMat}
        </mesh>
      ) : (
        <mesh position={[0, H / 2, 0]} castShadow receiveShadow
          onPointerDown={(e) => { e.stopPropagation(); if (selected) onDragStart(); else onSelect(); }}
        >
          <boxGeometry args={[w, H, h]} />
          {tableMat}
        </mesh>
      )}

      {/* Иконка поверх стола — полный размер, покрывает всю поверхность */}
      {iconUrl && (
        <group position={[0, H + 0.003, 0]}>
          <Suspense fallback={null}>
            <TableIconLayer url={iconUrl} tw={w} th={h} />
          </Suspense>
        </group>
      )}

      {/* Кольцо выделения */}
      {selected && (
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, h) / 2 + 0.05, Math.max(w, h) / 2 + 0.2, 32]} />
          <meshBasicMaterial color="#ff9900" transparent opacity={0.7} />
        </mesh>
      )}
      <Text position={[0, H + 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18} color={iconUrl ? '#333333' : '#ffffff'} anchorX="center" anchorY="middle"
        outlineColor={iconUrl ? '#ffffff' : '#000000'} outlineWidth={0.012}
      >
        {table.label}
      </Text>
    </group>
  );
}

// ─── Rectangle room drawing ───────────────────────────────────────────────────

function RectangleDrawing({ onComplete }: { onComplete: (polygon: Vec2[]) => void }) {
  const [start, setStart] = useState<Vec2 | null>(null);
  const [current, setCurrent] = useState<Vec2 | null>(null);

  const preview = useMemo(() => {
    if (!start || !current) return [];
    const { x: x1, y: z1 } = start, { x: x2, y: z2 } = current;
    return [
      new THREE.Vector3(x1, 0.02, z1), new THREE.Vector3(x2, 0.02, z1),
      new THREE.Vector3(x2, 0.02, z2), new THREE.Vector3(x1, 0.02, z2),
      new THREE.Vector3(x1, 0.02, z1),
    ];
  }, [start, current]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => { e.stopPropagation(); const p = { x: e.point.x, y: e.point.z }; setStart(p); setCurrent(p); }}
        onPointerMove={(e) => { if (start) setCurrent({ x: e.point.x, y: e.point.z }); }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!start || !current) return;
          if (Math.abs(current.x - start.x) > 0.5 && Math.abs(current.y - start.y) > 0.5) {
            onComplete([
              { x: start.x, y: start.y }, { x: current.x, y: start.y },
              { x: current.x, y: current.y }, { x: start.x, y: current.y },
            ]);
          }
          setStart(null); setCurrent(null);
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {start && <mesh position={[start.x, 0.1, start.y]}><sphereGeometry args={[0.12, 12, 12]} /><meshBasicMaterial color="#ff3333" /></mesh>}
      {current && start && <mesh position={[current.x, 0.1, current.y]}><sphereGeometry args={[0.12, 12, 12]} /><meshBasicMaterial color="#3388ff" /></mesh>}
      {preview.length > 0 && <Line points={preview} color="#3388ff" lineWidth={2} />}
      {start && current && (
        <Text position={[(start.x + current.x) / 2, 0.3, (start.y + current.y) / 2]}
          rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#88aaff" anchorX="center">
          {`${Math.abs(current.x - start.x).toFixed(1)} × ${Math.abs(current.y - start.y).toFixed(1)} м`}
        </Text>
      )}
    </>
  );
}

// ─── Scene lights ─────────────────────────────────────────────────────────────

function SceneLights({ settings }: { settings: LightSettings }) {
  return (
    <>
      <ambientLight intensity={settings.ambientIntensity} />
      {/* Main directional light — no castShadow to avoid triangular floor artifacts */}
      <directionalLight position={[8, 12, 6]} intensity={settings.mainIntensity} />
      {/* Fill light from opposite side */}
      <directionalLight position={[-6, 8, -4]} intensity={settings.mainIntensity * 0.3} />
      {/* Soft top light for interior feel */}
      <pointLight position={[0, 10, 0]} intensity={settings.mainIntensity * 0.4} color="#fff8f0" distance={30} />
    </>
  );
}

// ─── Main exported scene ──────────────────────────────────────────────────────

export interface Scene3DProps {
  plan: Hall3DPlan;
  tables: Table[];
  mode: 'draw' | 'addWallElement' | 'view';
  selectedElement: string | null;
  selectedTable: string | null;
  selectedWall: number | null;
  pendingWallElement: WallElementType | null;
  viewOnly?: boolean;
  onPolygonClose: (polygon: Vec2[]) => void;
  onWallElementAdd: (e: Omit<WallElement, 'id'>) => void;
  onElementSelect: (id: string | null) => void;
  onElementUpdate: (id: string, patch: Partial<Omit<WallElement, 'id' | 'type' | 'wallIndex'>>) => void;
  onTableSelect: (id: string | null) => void;
  onTableMove: (id: string, x: number, z: number) => void;
  onWallSelect: (index: number | null) => void;
}

export function Scene3D({
  plan, tables, mode, selectedElement, selectedTable, selectedWall, pendingWallElement, viewOnly = false,
  onPolygonClose, onWallElementAdd, onElementSelect, onElementUpdate, onTableSelect, onTableMove, onWallSelect,
}: Scene3DProps) {
  const [draggingWallEl, setDraggingWallEl] = useState<{ id: string; wallIndex: number } | null>(null);
  const [draggingTable, setDraggingTable] = useState<string | null>(null);

  useEffect(() => { if (mode !== 'draw') { setDraggingWallEl(null); setDraggingTable(null); } }, [mode]);

  const handleWallClick = useCallback(
    (wallIndex: number, offsetAlong: number, heightFromFloor: number) => {
      if (mode !== 'addWallElement' || !pendingWallElement) return;
      const meta = WALL_ELEMENT_META[pendingWallElement];
      onWallElementAdd({ type: pendingWallElement, wallIndex, offsetAlong, heightFromFloor, width: meta.defaultW, height: meta.defaultH });
    },
    [mode, pendingWallElement, onWallElementAdd],
  );

  const isClosed = plan.polygon.length >= 3;
  const orbitEnabled = (mode === 'view' || mode === 'addWallElement') && !draggingWallEl && !draggingTable;

  const orbitTarget = useMemo((): [number, number, number] => {
    if (!isClosed) return [5, 0, 5];
    const xs = plan.polygon.map((p) => p.x), zs = plan.polygon.map((p) => p.y);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
  }, [plan.polygon, isClosed]);

  const wt = plan.wallThickness ?? 0.3;
  const lights = plan.lightSettings ?? { ambientIntensity: 0.55, mainIntensity: 1.1 };

  return (
    <Canvas
      shadows={false}
      camera={{ fov: 50, near: 0.1, far: 500, position: [5, 10, 14] }}
      style={{ background: '#1a1a2e' }}
      onPointerMissed={() => { if (!draggingWallEl && !draggingTable) { onElementSelect(null); onTableSelect(null); onWallSelect(null); } }}
    >
      <CameraSetup polygon={plan.polygon} viewOnly={viewOnly} />
      <SceneLights settings={lights} />

      <OrbitControls
        enabled={orbitEnabled}
        target={orbitTarget}
        maxPolarAngle={viewOnly ? Math.PI / 3.5 : Math.PI / 2.05}
        minPolarAngle={viewOnly ? Math.PI / 3.5 : 0}
        enableRotate={!viewOnly}
        minDistance={2}
        maxDistance={50}
        makeDefault
      />

      <gridHelper args={[50, 50, '#888888', '#444444']} />

      {mode === 'draw' && <RectangleDrawing onComplete={onPolygonClose} />}

      {isClosed && (
        <>
          <Floor polygon={plan.polygon} color={plan.floorColor}
            textureUrl={plan.floorTextureUrl} textureRepeat={plan.floorTextureRepeat} />

          {/* Слои текстур пола */}
          {(plan.floorLayers ?? []).map((layer) => (
            <mesh key={layer.id} position={[layer.x, 0.002, layer.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[layer.width, layer.height]} />
              <Suspense fallback={null}>
                <FloorLayerMaterial url={layer.textureUrl} repeat={layer.repeat} />
              </Suspense>
            </mesh>
          ))}

          {/* Walls */}
          {plan.polygon.map((p1, i) => {
            const p2 = plan.polygon[(i + 1) % plan.polygon.length];
            return (
              <Wall key={i} p1={p1} p2={p2} wallHeight={plan.wallHeight} wallThickness={wt}
                color={plan.wallColor} wallIndex={i}
                textureUrl={plan.wallTextures?.[i]}
                interactive={mode === 'addWallElement'}
                selectable={mode === 'view'}
                selected={selectedWall === i}
                onWallClick={handleWallClick}
                onWallSelect={onWallSelect} />
            );
          })}

          {/* Corner fill boxes */}
          {plan.polygon.map((vertex, i) => (
            <WallCorner key={`corner-${i}`} vertex={vertex}
              wallHeight={plan.wallHeight} wallThickness={wt} color={plan.wallColor} />
          ))}

          {/* Wall element drag plane */}
          {draggingWallEl && (
            <WallDragPlane wallIndex={draggingWallEl.wallIndex} polygon={plan.polygon} wallHeight={plan.wallHeight}
              onMove={(o, h) => onElementUpdate(draggingWallEl.id, { offsetAlong: o, heightFromFloor: h })}
              onEnd={() => setDraggingWallEl(null)} />
          )}

          {/* Floor drag plane for tables */}
          {draggingTable && (
            <FloorDragPlane
              onMove={(x, z) => onTableMove(draggingTable, x, z)}
              onEnd={() => setDraggingTable(null)} />
          )}

          {/* Wall elements */}
          {plan.wallElements.map((el) => (
            <WallElementMesh key={el.id} element={el} polygon={plan.polygon}
              wallHeight={plan.wallHeight} wallThickness={wt}
              selected={selectedElement === el.id}
              onClick={() => onElementSelect(el.id === selectedElement ? null : el.id)}
              onDragStart={(wi) => setDraggingWallEl({ id: el.id, wallIndex: wi })} />
          ))}

          {/* Tables */}
          {tables.map((t) => (
            <Table3D key={t.id} table={t} scale={0.01}
              positionOverride={plan.tablePositions?.[t.id]}
              sizeOverride={plan.tableSizeOverrides?.[t.id]}
              iconUrl={plan.tableIcons?.[t.id]}
              tableColor={plan.tableColors?.[t.id]}
              selected={selectedTable === t.id}
              onSelect={() => onTableSelect(t.id === selectedTable ? null : t.id)}
              onDragStart={() => setDraggingTable(t.id)} />
          ))}
        </>
      )}

      {!isClosed && mode !== 'draw' && (
        <Text position={[5, 0.5, 5]} fontSize={0.4} color="#666688" anchorX="center" anchorY="middle">
          {'Переключитесь в режим\n"Нарисовать контур"'}
        </Text>
      )}
    </Canvas>
  );
}
