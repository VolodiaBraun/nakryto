'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Hall3DPlan, Vec2, WallElement, WallElementType } from './types3d';
import { WALL_ELEMENT_META } from './types3d';
import type { Table } from '@/types';

// ─── Polygon math helpers ─────────────────────────────────────────────────────

function wallAngle(p1: Vec2, p2: Vec2) {
  const dx = p2.x - p1.x;
  const dz = p2.y - p1.y;
  return Math.atan2(-dz, dx);
}

function wallLength(p1: Vec2, p2: Vec2) {
  const dx = p2.x - p1.x;
  const dz = p2.y - p1.y;
  return Math.sqrt(dx * dx + dz * dz);
}

// Convert hit point on a wall to (offsetAlong 0..1, heightFromFloor)
function hitToWallUV(
  hitPoint: THREE.Vector3,
  p1: Vec2,
  p2: Vec2,
  wallHeight: number,
): { offsetAlong: number; heightFromFloor: number } {
  const dx = p2.x - p1.x;
  const dz = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (p1.x + p2.x) / 2;
  const cz = (p1.y + p2.y) / 2;
  const wallCenter = new THREE.Vector3(cx, wallHeight / 2, cz);
  const rel = hitPoint.clone().sub(wallCenter);
  const edgeDir = new THREE.Vector3(dx / len, 0, dz / len);
  const localX = rel.dot(edgeDir);
  const localY = rel.y;
  return {
    offsetAlong: Math.max(0.05, Math.min(0.95, (localX + len / 2) / len)),
    heightFromFloor: Math.max(0.1, Math.min(wallHeight - 0.1, localY + wallHeight / 2)),
  };
}

// ─── Camera auto-fit ──────────────────────────────────────────────────────────

function CameraSetup({ polygon }: { polygon: Vec2[] }) {
  const { camera } = useThree();
  useEffect(() => {
    if (polygon.length < 3) {
      camera.position.set(5, 10, 14);
      camera.lookAt(5, 0, 5);
      return;
    }
    const xs = polygon.map((p) => p.x);
    const zs = polygon.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    camera.position.set(cx, span * 1.2, cz + span * 1.1);
    camera.lookAt(cx, 0, cz);
  }, []); // once on mount
  return null;
}

// ─── Floor ────────────────────────────────────────────────────────────────────
// ShapeGeometry lives in XY plane. Rotating by [Math.PI/2, 0, 0] maps:
//   local (x, y) → world (x, 0, y)  ← matches polygon.y → world Z
// Normal after this rotation points -Y (downward), so we use DoubleSide.

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
    // [Math.PI/2, 0, 0] maps shape (x,y) → world (x, 0, y), aligning with walls
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Single wall face ─────────────────────────────────────────────────────────

interface WallProps {
  p1: Vec2;
  p2: Vec2;
  wallHeight: number;
  color: string;
  wallIndex: number;
  interactive: boolean;
  onWallClick?: (wallIndex: number, offsetAlong: number, heightFromFloor: number) => void;
}

function Wall({ p1, p2, wallHeight, color, wallIndex, interactive, onWallClick }: WallProps) {
  const [hovered, setHovered] = useState(false);
  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2;
  const cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive || !onWallClick) return;
      e.stopPropagation();
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
      receiveShadow
      castShadow
    >
      <planeGeometry args={[len, wallHeight]} />
      <meshStandardMaterial
        color={hovered && interactive ? '#d8d4c4' : color}
        side={THREE.DoubleSide}
        roughness={0.9}
      />
    </mesh>
  );
}

// ─── Invisible drag plane (large plane coplanar with a wall) ──────────────────

function WallDragPlane({
  wallIndex,
  polygon,
  wallHeight,
  onMove,
  onEnd,
}: {
  wallIndex: number;
  polygon: Vec2[];
  wallHeight: number;
  onMove: (offsetAlong: number, heightFromFloor: number) => void;
  onEnd: () => void;
}) {
  const p1 = polygon[wallIndex];
  const p2 = polygon[(wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;

  const len = wallLength(p1, p2);
  const cx = (p1.x + p2.x) / 2;
  const cz = (p1.y + p2.y) / 2;
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
      {/* Large enough to cover any drag range */}
      <planeGeometry args={[Math.max(len * 4, 40), Math.max(wallHeight * 4, 20)]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Wall element (window / door / artwork / lamp) ────────────────────────────

function WallElementMesh({
  element,
  polygon,
  wallHeight,
  selected,
  onClick,
  onDragStart,
}: {
  element: WallElement;
  polygon: Vec2[];
  wallHeight: number;
  selected: boolean;
  onClick: () => void;
  onDragStart: (wallIndex: number) => void;
}) {
  const p1 = polygon[element.wallIndex];
  const p2 = polygon[(element.wallIndex + 1) % polygon.length];
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x;
  const dz = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dz * dz);
  const cx = (p1.x + p2.x) / 2;
  const cz = (p1.y + p2.y) / 2;
  const angle = wallAngle(p1, p2);

  const edgeDirX = dx / len;
  const edgeDirZ = dz / len;
  const localXOffset = (element.offsetAlong - 0.5) * len;
  const normalX = dz / len;
  const normalZ = -dx / len;
  const ZFIGHT = 0.03;

  const wx = cx + edgeDirX * localXOffset + normalX * ZFIGHT;
  const wy = element.heightFromFloor;
  const wz = cz + edgeDirZ * localXOffset + normalZ * ZFIGHT;

  const meta = WALL_ELEMENT_META[element.type];

  return (
    <group>
      {/* Window frame background */}
      {element.type === 'window' && (
        <mesh
          position={[wx + normalX * 0.001, wy, wz + normalZ * 0.001]}
          rotation={[0, angle, 0]}
        >
          <planeGeometry args={[element.width + 0.1, element.height + 0.1]} />
          <meshStandardMaterial color="#c8c0a8" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Main element */}
      <mesh
        position={[wx, wy, wz]}
        rotation={[0, angle, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (selected) {
            onDragStart(element.wallIndex);
          } else {
            onClick();
          }
        }}
      >
        <planeGeometry args={[element.width, element.height]} />
        <meshStandardMaterial
          color={meta.color}
          side={THREE.DoubleSide}
          transparent
          opacity={element.type === 'window' ? 0.6 : 0.92}
          emissive={selected ? '#ffffff' : '#000000'}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>

      {/* Window cross dividers */}
      {element.type === 'window' && (
        <>
          <mesh position={[wx + normalX * 0.005, wy, wz + normalZ * 0.005]} rotation={[0, angle, 0]}>
            <planeGeometry args={[0.06, element.height + 0.05]} />
            <meshStandardMaterial color="#c8c0a8" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[wx + normalX * 0.005, wy, wz + normalZ * 0.005]} rotation={[0, angle, 0]}>
            <planeGeometry args={[element.width + 0.05, 0.06]} />
            <meshStandardMaterial color="#c8c0a8" side={THREE.DoubleSide} />
          </mesh>
        </>
      )}

      {/* Lamp glow */}
      {element.type === 'lamp' && (
        <pointLight
          position={[wx - normalX * 0.4, wy, wz - normalZ * 0.4]}
          color="#ffe8a0"
          intensity={0.8}
          distance={4}
        />
      )}

      {/* Selection outline */}
      {selected && (
        <mesh
          position={[wx - normalX * 0.005, wy, wz - normalZ * 0.005]}
          rotation={[0, angle, 0]}
        >
          <planeGeometry args={[element.width + 0.15, element.height + 0.15]} />
          <meshBasicMaterial color="#60a5fa" side={THREE.DoubleSide} transparent opacity={0.4} />
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
  const TABLE_H = 0.08;

  return (
    <group position={[x, 0, z]}>
      {table.shape === 'ROUND' ? (
        <mesh position={[0, TABLE_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[Math.min(w, h) / 2, Math.min(w, h) / 2, TABLE_H, 24]} />
          <meshStandardMaterial color="#7a5c38" roughness={0.6} />
        </mesh>
      ) : (
        <mesh position={[0, TABLE_H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, TABLE_H, h]} />
          <meshStandardMaterial color="#7a5c38" roughness={0.6} />
        </mesh>
      )}
      <Text
        position={[0, TABLE_H + 0.14, 0]}
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

// ─── Polygon drawing overlay ──────────────────────────────────────────────────

function PolygonDrawing({
  vertices,
  mousePos,
  onGroundClick,
  onGroundMove,
}: {
  vertices: Vec2[];
  mousePos: Vec2 | null;
  onGroundClick: (p: Vec2) => void;
  onGroundMove: (p: Vec2) => void;
}) {
  const linePoints = useMemo(() => {
    const pts = vertices.map((v) => new THREE.Vector3(v.x, 0.02, v.y));
    if (mousePos && vertices.length > 0) {
      pts.push(new THREE.Vector3(mousePos.x, 0.02, mousePos.y));
    }
    return pts;
  }, [vertices, mousePos]);

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onGroundClick({ x: e.point.x, y: e.point.z });
        }}
        onPointerMove={(e) => onGroundMove({ x: e.point.x, y: e.point.z })}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {vertices.map((v, i) => (
        <mesh key={i} position={[v.x, 0.1, v.y]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color={i === 0 ? '#ff3333' : '#3388ff'} />
        </mesh>
      ))}

      {linePoints.length >= 2 && (
        <Line points={linePoints} color="#3388ff" lineWidth={2} />
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
  onPolygonVertex: (polygon: Vec2[]) => void;
  onPolygonClose: (polygon: Vec2[]) => void;
  onWallElementAdd: (e: Omit<WallElement, 'id'>) => void;
  onElementSelect: (id: string | null) => void;
  onElementUpdate: (id: string, patch: Partial<Pick<WallElement, 'offsetAlong' | 'heightFromFloor'>>) => void;
}

export function Scene3D({
  plan,
  tables,
  mode,
  selectedElement,
  pendingWallElement,
  onPolygonVertex,
  onPolygonClose,
  onWallElementAdd,
  onElementSelect,
  onElementUpdate,
}: Scene3DProps) {
  const [drawVertices, setDrawVertices] = useState<Vec2[]>([]);
  const [mousePos, setMousePos] = useState<Vec2 | null>(null);
  const [dragging, setDragging] = useState<{ id: string; wallIndex: number } | null>(null);

  useEffect(() => {
    if (mode !== 'draw') {
      setDrawVertices([]);
      setMousePos(null);
    }
  }, [mode]);

  const handleGroundClick = useCallback(
    (p: Vec2) => {
      if (mode !== 'draw') return;
      if (drawVertices.length >= 3) {
        const first = drawVertices[0];
        const dist = Math.sqrt((p.x - first.x) ** 2 + (p.y - first.y) ** 2);
        if (dist < 0.4) {
          onPolygonClose(drawVertices);
          setDrawVertices([]);
          return;
        }
      }
      const next = [...drawVertices, p];
      setDrawVertices(next);
      onPolygonVertex(next);
    },
    [mode, drawVertices, onPolygonClose, onPolygonVertex],
  );

  const handleWallClick = useCallback(
    (wallIndex: number, offsetAlong: number, heightFromFloor: number) => {
      if (mode !== 'addWallElement' || !pendingWallElement) return;
      const meta = WALL_ELEMENT_META[pendingWallElement];
      onWallElementAdd({
        type: pendingWallElement,
        wallIndex,
        offsetAlong,
        heightFromFloor,
        width: meta.defaultW,
        height: meta.defaultH,
      });
    },
    [mode, pendingWallElement, onWallElementAdd],
  );

  const handleDragStart = useCallback((id: string, wallIndex: number) => {
    setDragging({ id, wallIndex });
  }, []);

  const handleDragMove = useCallback(
    (offsetAlong: number, heightFromFloor: number) => {
      if (!dragging) return;
      onElementUpdate(dragging.id, { offsetAlong, heightFromFloor });
    },
    [dragging, onElementUpdate],
  );

  const handleDragEnd = useCallback(() => setDragging(null), []);

  const isClosed = plan.polygon.length >= 3;
  const orbitEnabled = (mode === 'view' || mode === 'addWallElement') && !dragging;

  const orbitTarget = useMemo((): [number, number, number] => {
    if (!isClosed) return [5, 0, 5];
    const xs = plan.polygon.map((p) => p.x);
    const zs = plan.polygon.map((p) => p.y);
    return [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      0,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    ];
  }, [plan.polygon, isClosed]);

  return (
    <Canvas
      shadows
      camera={{ fov: 50, near: 0.1, far: 500, position: [5, 10, 14] }}
      style={{ background: '#1a1a2e' }}
      onPointerMissed={() => !dragging && onElementSelect(null)}
    >
      <CameraSetup polygon={plan.polygon} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-5, 6, -3]} intensity={0.3} color="#fff8e8" />

      <OrbitControls
        enabled={orbitEnabled}
        target={orbitTarget}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={40}
        makeDefault
      />

      <gridHelper args={[50, 50, '#888888', '#444444']} position={[0, 0, 0]} />

      {mode === 'draw' && (
        <PolygonDrawing
          vertices={drawVertices}
          mousePos={mousePos}
          onGroundClick={handleGroundClick}
          onGroundMove={setMousePos}
        />
      )}

      {isClosed && (
        <>
          <Floor polygon={plan.polygon} color={plan.floorColor} />

          {plan.polygon.map((p1, i) => {
            const p2 = plan.polygon[(i + 1) % plan.polygon.length];
            return (
              <Wall
                key={i}
                p1={p1}
                p2={p2}
                wallHeight={plan.wallHeight}
                color={plan.wallColor}
                wallIndex={i}
                interactive={mode === 'addWallElement'}
                onWallClick={handleWallClick}
              />
            );
          })}

          {/* Invisible drag plane — mounted only while dragging */}
          {dragging && (
            <WallDragPlane
              wallIndex={dragging.wallIndex}
              polygon={plan.polygon}
              wallHeight={plan.wallHeight}
              onMove={handleDragMove}
              onEnd={handleDragEnd}
            />
          )}

          {plan.wallElements.map((el) => (
            <WallElementMesh
              key={el.id}
              element={el}
              polygon={plan.polygon}
              wallHeight={plan.wallHeight}
              selected={selectedElement === el.id}
              onClick={() => onElementSelect(el.id === selectedElement ? null : el.id)}
              onDragStart={(wallIndex) => handleDragStart(el.id, wallIndex)}
            />
          ))}

          {tables.map((t) => (
            <Table3D key={t.id} table={t} scale={0.01} />
          ))}
        </>
      )}

      {!isClosed && mode !== 'draw' && (
        <Text
          position={[5, 0.5, 5]}
          fontSize={0.4}
          color="#666688"
          anchorX="center"
          anchorY="middle"
        >
          {'Переключитесь в режим\n"Нарисовать контур"'}
        </Text>
      )}
    </Canvas>
  );
}
