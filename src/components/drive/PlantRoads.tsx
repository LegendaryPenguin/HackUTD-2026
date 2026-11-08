/**
 * Full-width asphalt ribbons using proven strip geometry.
 * Lane paint lives in the texture so it cannot collapse into a thin curb line.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  activeRibbonPath,
  buildRibbonGeometry,
  ROAD_HALF_WIDTH,
  type RoadRibbon,
} from '../../lib/driveRoads';
import type { DrivePoint } from '../../lib/driveMap';

function makeAsphaltTexture(lit: boolean, repeatV: number) {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = lit ? '#4a5560' : '#343c46';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 1400; i++) {
    const g = 40 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${g},${g + 3},${g + 6},${0.1 + Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random() * 2);
  }

  // White edge lines
  ctx.fillStyle = '#f0f4f8';
  ctx.fillRect(4, 0, 6, h);
  ctx.fillRect(w - 10, 0, 6, h);

  // Dark channel just inside edges
  ctx.fillStyle = 'rgba(12, 14, 18, 0.45)';
  ctx.fillRect(10, 0, 5, h);
  ctx.fillRect(w - 15, 0, 5, h);

  // Yellow center dashes
  ctx.fillStyle = '#f5c84a';
  const dash = 28;
  const gap = 22;
  for (let y = 8; y < h; y += dash + gap) {
    ctx.fillRect(w / 2 - 4, y, 8, dash);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, Math.max(3, repeatV));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function RoadDeck({ ribbon, active }: { ribbon: RoadRibbon; active: boolean }) {
  const closed = ribbon.kind === 'ring';

  const deck = useMemo(
    () => buildRibbonGeometry(ribbon.samples, ROAD_HALF_WIDTH, closed),
    [ribbon],
  );
  const shoulder = useMemo(
    () => buildRibbonGeometry(ribbon.samples, ROAD_HALF_WIDTH + 2.2, closed),
    [ribbon],
  );
  const tex = useMemo(
    () => makeAsphaltTexture(active, Math.max(4, ribbon.length * 0.09)),
    [active, ribbon.length],
  );

  return (
    <group>
      <mesh geometry={shoulder} position={[0, 0.04, 0]}>
        <meshBasicMaterial color="#2a2620" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={deck} position={[0, 0.12, 0]}>
        <meshBasicMaterial
          map={tex}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function RoadLamps({ ribbon }: { ribbon: RoadRibbon }) {
  const lamps = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const step = Math.max(4, Math.floor(ribbon.samples.length / 7));
    for (let i = step; i < ribbon.samples.length - 1; i += step) {
      const p = ribbon.samples[i];
      const t = ribbon.tangents[i];
      out.push({
        x: p.x + (-t.z) * (ROAD_HALF_WIDTH + 2.2),
        z: p.z + t.x * (ROAD_HALF_WIDTH + 2.2),
      });
    }
    return out;
  }, [ribbon]);

  return (
    <group>
      {lamps.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.09, 0.12, 4.8, 5]} />
            <meshBasicMaterial color="#3a4a52" toneMapped={false} />
          </mesh>
          <mesh position={[0, 4.9, 0]}>
            <sphereGeometry args={[0.26, 6, 6]} />
            <meshBasicMaterial color="#dff6ff" toneMapped={false} />
          </mesh>
          <pointLight position={[0, 4.7, 0]} intensity={5} distance={14} color="#c8f0f8" />
        </group>
      ))}
    </group>
  );
}

export function PlantRoads({
  ribbons,
  points,
  targetId,
}: {
  ribbons: RoadRibbon[];
  points: DrivePoint[];
  targetId: string | null;
}) {
  const activeIds = useMemo(
    () => (targetId ? activeRibbonPath(ribbons, points, targetId) : new Set<string>()),
    [ribbons, points, targetId],
  );

  return (
    <group>
      {ribbons.map((r) => {
        const active = activeIds.has(r.id) || r.kind === 'ring' || r.kind === 'access';
        return (
          <group key={r.id}>
            <RoadDeck ribbon={r} active={active} />
            {(r.kind === 'access' || r.kind === 'ring') && <RoadLamps ribbon={r} />}
          </group>
        );
      })}
    </group>
  );
}
