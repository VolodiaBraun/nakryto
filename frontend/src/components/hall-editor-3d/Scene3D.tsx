'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Hall3DPlan, Vec2, WallElement, WallElementType } from './types3d';
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

function CameraSetup({
  polygon,
  viewOnly,
}: {
  polygon: Vec2[];
  viewOnly: boolean;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const xs = polygon.length >= 3 ? polygon.map((p) => p.x) : [0, 10];
    const zs = polygon.length >= 3 ? polygon.map((p) => p.y) : [0, 8];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4);
    if (viewOnly) {
      // Fixed top-down perspective for guests
      camera.position.set(cx, span * 1.8, cz + span * 0.5);
    } else {
      camera.position.set(cx, span * 1.2, cz + span * 1.1);
    }
    camera.lookAt(cx, 0, cz);
  }, []); // once on mount
  return null;
}

// ─── Floor ────────────────────────────────────────────────────────────────────
// rotation=[Math.PI/2] maps shape (x,y) → world (x, 0, y), matching walls at world Z = polygon.y
// DoubleSide needed because normal points downward after this rotation

function Floor({ polygon, color }: { polygon: Vec2[]; color: string }) {
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
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Wall (BoxGeometry with thickness) ───────────────────────────────────────

interface WallProps {
  p1: Vec2;
  p2: Vec2;
  wallHeight: number;
  wallThickness: number;
  color: string;
  wallIndex: number;
  interactive: boolean;
  onWallClick?: (wallIndex: number, offsetAlong: number, heightFromFloor: number) => void;
}

function Wall({ p1, p2, wallHeight, wallThickness, color, wallIndex, interactive, onWallClick }: WallProps) {
  const [hovered, setHovered] = useState(false);
  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive || !onWallClick) return;
      e.stopPropagation();
      // Only accept clicks on the large face (local normal.z ≈ ±1), skip edge faces
      if (!e.face || Math.abs(e.face.normal.z) < 0.5) return;
      const { offsetAlong, heightFromFloor } = hitToWallUV(e.point, p1, p2, wallHeight);
      onWallClick(wallIndex, offsetAlong, heightFromFloor);
    },
    [p1, p2, wallHeight, wallIndex, interactive, onWallClick],
  );

  return (
    <mesh
      position={[cx, wallHeight / 2, cz]}
      rotation={[0, angle, 0]}
      onClick={handleClick}
      onPointerOver={() => interactive && setHovered(true)}
      onPointerOut={() => setHovered(false)}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[len, wallHeight, wallThickness]} />
      <meshStandardMaterial color={hovered && interactive ? '#d8d4c4' : color} roughness={0.9} />
    </mesh>
  );
}

// ─── Invisible drag plane (large plane coplanar with a wall) ──────────────────

function WallDragPlane({
  wallIndex, polygon, wallHeight,
  onMove, onEnd,
}: {
  wallIndex: number; polygon: Vec2[]; wallHeight: number;
  onMove: (o: number, h: number) => void;
  onEnd: () => void;
}) {
  const p1 = polygon[wallIndex];
  const p2 = polygon[(wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;

  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);

  return (
    <mesh
      position={[cx, wallHeight / 2, cz]}
      rotation={[0, angle, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const { offsetAlong, heightFromFloor } = hitToWallUV(e.point, p1, p2, wallHeight);
        onMove(offsetAlong, heightFromFloor);
      }}
      onPointerUp={(e) => { e.stopPropagation(); onEnd(); }}
      onPointerLeave={(e) => { e.stopPropagation(); onEnd(); }}
    >
      <planeGeometry args={[Math.max(len * 4, 60), Math.max(wallHeight * 4, 20)]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Wall element ─────────────────────────────────────────────────────────────
// Uses BoxGeometry so the element is embedded in the wall and visible from BOTH sides.
// Depth = wallThickness + 0.06 so it protrudes slightly on each face.

function WallElementMesh({
  element, polygon, wallHeight, wallThickness, selected, onClick, onDragStart,
}: {
  element: WallElement; polygon: Vec2[]; wallHeight: number; wallThickness: number;
  selected: boolean; onClick: () => void; onDragStart: (wallIndex: number) => void;
}) {
  const p1 = polygon[element.wallIndex];
  const p2 = polygon[(element.wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x, dz = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);
  const edgeDirX = dx / len, edgeDirZ = dz / len;

  // Position on wall centerline — no normal offset needed (box protrudes from both faces)
  const wx = cx + edgeDirX * (element.offsetAlong - 0.5) * len;
  const wy = element.heightFromFloor;
  const wz = cz + edgeDirZ * (element.offsetAlong - 0.5) * len;

  const meta = WALL_ELEMENT_META[element.type];
  const depth = wallThickness + 0.06; // protrudes through both wall faces

  return (
    <group>
      {/* Window frame (slightly wider box behind glass) */}
      {element.type === 'window' && (
        <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
          <boxGeometry args={[element.width + 0.1, element.height + 0.1, depth]} />
          <meshStandardMaterial color="#c8c0a8" roughness={0.7} />
        </mesh>
      )}

      {/* Main element box */}
      <mesh
        position={[wx, wy, wz]}
        rotation={[0, angle, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (selected) onDragStart(element.wallIndex);
          else onClick();
        }}
      >
        <boxGeometry args={[element.width, element.height, depth]} />
        <meshStandardMaterial
          color={meta.color}
          transparent
          opacity={element.type === 'window' ? 0.55 : 0.92}
          roughness={0.4}
          emissive={selected ? '#ffffff' : '#000000'}
          emissiveIntensity={selected ? 0.18 : 0}
        />
      </mesh>

      {/* Window cross bars */}
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

      {/* Lamp glow */}
      {element.type === 'lamp' && (
        <pointLight position={[wx, wy - 0.3, wz]} color="#ffe8a0" intensity={0.9} distance={5} />
      )}

      {/* Selection ring */}
      {selected && (
        <mesh position={[wx, wy, wz]} rotation={[0, angle, 0]}>
          <boxGeometry args={[element.width + 0.2, element.height + 0.2, depth + 0.02]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

// ─── Table objects ────────────────────────────────────────────────────────────

function Table3D({ table, scale }: { table: Table; scale: number }) {
  const x = table.positionX * scale;
  const z = table.positionY * scale;
  const w = (table.width || 100) * scale;
  const h = (table.height || 100) * scale;
  const H = 0.08;

  return (
    <group position={[x, 0, z]}>
      {table.shape === 'ROUND' ? (
        <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[Math.min(w, h) / 2, Math.min(w, h) / 2, H, 24]} />
          <meshStandardMaterial color="#7a5c38" roughness={0.6} />
        </mesh>
      ) : (
        <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, H, h]} />
          <meshStandardMaterial color="#7a5c38" roughness={0.6} />
        </mesh>
      )}
      <Text
        position={[0, H + 0.14, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineColor="#000000"
        outlineWidth={0.012}
      >
        {table.label}
      </Text>
    </group>
  );
}

// ─── Rectangle room drawing ───────────────────────────────────────────────────
// Drag to define rectangular room: pointerDown = first corner, pointerUp = opposite corner.

function RectangleDrawing({
  onComplete,
}: {
  onComplete: (polygon: Vec2[]) => void;
}) {
  const [start, setStart] = useState<Vec2 | null>(null);
  const [current, setCurrent] = useState<Vec2 | null>(null);
  const isDragging = start !== null;

  const preview: THREE.Vector3[] = useMemo(() => {
    if (!start || !current) return [];
    const { x: x1, y: z1 } = start;
    const { x: x2, y: z2 } = current;
    return [
      new THREE.Vector3(x1, 0.02, z1),
      new THREE.Vector3(x2, 0.02, z1),
      new THREE.Vector3(x2, 0.02, z2),
      new THREE.Vector3(x1, 0.02, z2),
      new THREE.Vector3(x1, 0.02, z1),
    ];
  }, [start, current]);

  return (
    <>
      {/* Ground plane for event capture */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          const p = { x: e.point.x, y: e.point.z };
          setStart(p);
          setCurrent(p);
        }}
        onPointerMove={(e) => {
          if (!isDragging) return;
          setCurrent({ x: e.point.x, y: e.point.z });
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (!start || !current) return;
          const dx = Math.abs(current.x - start.x);
          const dz = Math.abs(current.y - start.y);
          if (dx > 0.5 && dz > 0.5) {
            onComplete([
              { x: start.x,   y: start.y   },
              { x: current.x, y: start.y   },
              { x: current.x, y: current.y },
              { x: start.x,   y: current.y },
            ]);
          }
          setStart(null);
          setCurrent(null);
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Corner markers */}
      {start && (
        <mesh position={[start.x, 0.08, start.y]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#ff3333" />
        </mesh>
      )}
      {current && start && (
        <mesh position={[current.x, 0.08, current.y]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#3388ff" />
        </mesh>
      )}

      {/* Rectangle preview */}
      {preview.length > 0 && (
        <Line points={preview} color="#3388ff" lineWidth={2} />
      )}

      {/* Size label */}
      {start && current && (
        <Text
          position={[(start.x + current.x) / 2, 0.3, (start.y + current.y) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.3}
          color="#88aaff"
          anchorX="center"
        >
          {`${Math.abs(current.x - start.x).toFixed(1)} × ${Math.abs(current.y - start.y).toFixed(1)} м`}
        </Text>
      )}
    </>
  );
}

// ─── Main exported scene ──────────────────────────────────────────────────────

export interface Scene3DProps {
  plan: Hall3DPlan;
  tables: Table[];
  mode: 'draw' | 'addWallElement' | 'view';
  selectedElement: string | null;
  pendingWallElement: WallElementType | null;
  viewOnly?: boolean;
  onPolygonClose: (polygon: Vec2[]) => void;
  onWallElementAdd: (e: Omit<WallElement, 'id'>) => void;
  onElementSelect: (id: string | null) => void;
  onElementUpdate: (id: string, patch: Partial<Pick<WallElement, 'offsetAlong' | 'heightFromFloor'>>) => void;
}

export function Scene3D({
  plan, tables, mode, selectedElement, pendingWallElement, viewOnly = false,
  onPolygonClose, onWallElementAdd, onElementSelect, onElementUpdate,
}: Scene3DProps) {
  const [dragging, setDragging] = useState<{ id: string; wallIndex: number } | null>(null);

  useEffect(() => {
    if (mode !== 'draw') setDragging(null);
  }, [mode]);

  const handleWallClick = useCallback(
    (wallIndex: number, offsetAlong: number, heightFromFloor: number) => {
      if (mode !== 'addWallElement' || !pendingWallElement) return;
      const meta = WALL_ELEMENT_META[pendingWallElement];
      onWallElementAdd({ type: pendingWallElement, wallIndex, offsetAlong, heightFromFloor, width: meta.defaultW, height: meta.defaultH });
    },
    [mode, pendingWallElement, onWallElementAdd],
  );

  const handleDragStart = useCallback((id: string, wallIndex: number) => setDragging({ id, wallIndex }), []);

  const handleDragMove = useCallback(
    (offsetAlong: number, heightFromFloor: number) => {
      if (!dragging) return;
      onElementUpdate(dragging.id, { offsetAlong, heightFromFloor });
    },
    [dragging, onElementUpdate],
  );

  const isClosed = plan.polygon.length >= 3;
  const orbitEnabled = (mode === 'view' || mode === 'addWallElement') && !dragging;

  const orbitTarget = useMemo((): [number, number, number] => {
    if (!isClosed) return [5, 0, 5];
    const xs = plan.polygon.map((p) => p.x);
    const zs = plan.polygon.map((p) => p.y);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
  }, [plan.polygon, isClosed]);

  return (
    <Canvas
      shadows
      camera={{ fov: 50, near: 0.1, far: 500, position: [5, 10, 14] }}
      style={{ background: '#1a1a2e' }}
      onPointerMissed={() => !dragging && onElementSelect(null)}
    >
      <CameraSetup polygon={plan.polygon} viewOnly={viewOnly} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-5, 6, -3]} intensity={0.3} color="#fff8e8" />

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

      {/* Rectangle drawing overlay */}
      {mode === 'draw' && (
        <RectangleDrawing onComplete={onPolygonClose} />
      )}

      {isClosed && (
        <>
          <Floor polygon={plan.polygon} color={plan.floorColor} />

          {plan.polygon.map((p1, i) => {
            const p2 = plan.polygon[(i + 1) % plan.polygon.length];
            return (
              <Wall
                key={i}
                p1={p1} p2={p2}
                wallHeight={plan.wallHeight}
                wallThickness={plan.wallThickness ?? 0.3}
                color={plan.wallColor}
                wallIndex={i}
                interactive={mode === 'addWallElement'}
                onWallClick={handleWallClick}
              />
            );
          })}

          {dragging && (
            <WallDragPlane
              wallIndex={dragging.wallIndex}
              polygon={plan.polygon}
              wallHeight={plan.wallHeight}
              onMove={handleDragMove}
              onEnd={() => setDragging(null)}
            />
          )}

          {plan.wallElements.map((el) => (
            <WallElementMesh
              key={el.id}
              element={el}
              polygon={plan.polygon}
              wallHeight={plan.wallHeight}
              wallThickness={plan.wallThickness ?? 0.3}
              selected={selectedElement === el.id}
              onClick={() => onElementSelect(el.id === selectedElement ? null : el.id)}
              onDragStart={(wi) => handleDragStart(el.id, wi)}
            />
          ))}

          {tables.map((t) => (
            <Table3D key={t.id} table={t} scale={0.01} />
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
