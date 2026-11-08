import { useMemo } from 'react';
import * as THREE from 'three';
import {
  activeRibbonPath,
  buildRibbonGeometry,
  ROAD_HALF_WIDTH,
  type RoadRibbon,
} from '../../lib/driveRoads';
import type { DrivePoint } from '../../lib/driveMap';

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a4a54';
  ctx.fillRect(0, 0, 64, 128);
  // asphalt grain
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 128, 1, 1);
  }
  // center dashes — bright so roads read at night
  ctx.fillStyle = '#f0f6fa';
  for (let y = 4; y < 128; y += 16) ctx.fillRect(28, y, 8, 9);
  // edge lines
  ctx.fillStyle = '#d8e6ec';
  ctx.fillRect(2, 0, 4, 128);
  ctx.fillRect(58, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function RibbonMesh({ ribbon, active }: { ribbon: RoadRibbon; active: boolean }) {
  const geo = useMemo(
    () => buildRibbonGeometry(ribbon.samples, ROAD_HALF_WIDTH, ribbon.kind === 'ring'),
    [ribbon],
  );
  const shoulder = useMemo(
    () => buildRibbonGeometry(ribbon.samples, ROAD_HALF_WIDTH + 2.2, ribbon.kind === 'ring'),
    [ribbon],
  );
  const tex = useMemo(() => asphaltTexture(), []);

  return (
    <group>
      {/* gravel shoulder */}
      <mesh geometry={shoulder} position={[0, 0.02, 0]}>
        <meshStandardMaterial color="#5a6a58" roughness={0.98} metalness={0.02} />
      </mesh>
      {/* asphalt deck — lifted so it never sinks into grass */}
      <mesh geometry={geo} position={[0, 0.06, 0]}>
        <meshStandardMaterial
          map={tex}
          color={active ? '#8eb8c8' : '#6a8290'}
          roughness={0.78}
          metalness={0.14}
          emissive={active ? '#2a6070' : '#152028'}
          emissiveIntensity={active ? 0.7 : 0.22}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
}

function RibbonLamps({ ribbon, bright }: { ribbon: RoadRibbon; bright: boolean }) {
  const lamps = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const step = Math.max(2, Math.floor(ribbon.samples.length / (bright ? 6 : 4)));
    for (let i = step; i < ribbon.samples.length - 1; i += step) {
      const p = ribbon.samples[i];
      const t = ribbon.tangents[i];
      out.push({
        x: p.x + (-t.z) * (ROAD_HALF_WIDTH + 1.6),
        z: p.z + t.x * (ROAD_HALF_WIDTH + 1.6),
      });
    }
    return out;
  }, [ribbon, bright]);

  return (
    <group>
      {lamps.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh position={[0, 2.2, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 4.4, 5]} />
            <meshStandardMaterial color="#3a4a52" metalness={0.4} roughness={0.45} />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshStandardMaterial
              color="#e8f6ff"
              emissive="#9ae4ef"
              emissiveIntensity={bright ? 1.6 : 0.85}
            />
          </mesh>
          {bright && <pointLight position={[0, 4.3, 0]} intensity={4} distance={14} color="#c8f0f8" />}
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
        const active = activeIds.has(r.id);
        const arterial = r.kind === 'access' || r.kind === 'ring';
        return (
          <group key={r.id}>
            <RibbonMesh ribbon={r} active={active || arterial} />
            {arterial && <RibbonLamps ribbon={r} bright={active} />}
          </group>
        );
      })}
    </group>
  );
}
