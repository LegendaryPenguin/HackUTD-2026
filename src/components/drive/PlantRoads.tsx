/**
 * Asphalt decks with geometric lane paint.
 * No stretched texture, so junctions stay flat instead of smearing into stripes.
 */
import { useMemo } from 'react';
import {
  activeRibbonPath,
  buildCenterDashes,
  buildPathStrip,
  ROAD_HALF_WIDTH,
  type RoadRibbon,
} from '../../lib/driveRoads';
import type { DrivePoint } from '../../lib/driveMap';

function RoadDeck({ ribbon, active, lift }: { ribbon: RoadRibbon; active: boolean; lift: number }) {
  const closed = ribbon.kind === 'ring';
  const y = 0.07 + lift;

  const shoulder = useMemo(
    () => buildPathStrip(ribbon.samples, closed, 0, ROAD_HALF_WIDTH + 1.35, y - 0.035),
    [ribbon, closed, y],
  );
  const deck = useMemo(
    () => buildPathStrip(ribbon.samples, closed, 0, ROAD_HALF_WIDTH, y),
    [ribbon, closed, y],
  );
  const edgeL = useMemo(
    () => buildPathStrip(ribbon.samples, closed, ROAD_HALF_WIDTH - 0.38, 0.09, y + 0.02),
    [ribbon, closed, y],
  );
  const edgeR = useMemo(
    () => buildPathStrip(ribbon.samples, closed, -(ROAD_HALF_WIDTH - 0.38), 0.09, y + 0.02),
    [ribbon, closed, y],
  );
  const dashes = useMemo(
    () => buildCenterDashes(ribbon.samples, closed, y + 0.025),
    [ribbon, closed, y],
  );

  const asphalt = active ? '#46525c' : '#3a434c';

  return (
    <group>
      <mesh geometry={shoulder}>
        <meshStandardMaterial color="#2a261f" roughness={1} metalness={0} />
      </mesh>
      <mesh geometry={deck}>
        <meshStandardMaterial
          color={asphalt}
          roughness={0.94}
          metalness={0.02}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh geometry={edgeL}>
        <meshStandardMaterial color="#e7eef2" roughness={0.6} metalness={0} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      <mesh geometry={edgeR}>
        <meshStandardMaterial color="#e7eef2" roughness={0.6} metalness={0} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      {dashes.getAttribute('position')?.count ? (
        <mesh geometry={dashes}>
          <meshStandardMaterial color="#e2b34a" roughness={0.55} metalness={0} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      ) : null}
    </group>
  );
}

function RoadLamps({ ribbon }: { ribbon: RoadRibbon }) {
  const lamps = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const step = Math.max(6, Math.floor(ribbon.samples.length / 5));
    for (let i = step; i < ribbon.samples.length - 1; i += step) {
      const p = ribbon.samples[i];
      const t = ribbon.tangents[i];
      if (!t) continue;
      out.push({
        x: p.x + (-t.z) * (ROAD_HALF_WIDTH + 1.8),
        z: p.z + t.x * (ROAD_HALF_WIDTH + 1.8),
      });
    }
    return out;
  }, [ribbon]);

  return (
    <group>
      {lamps.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh position={[0, 2.2, 0]}>
            <cylinderGeometry args={[0.07, 0.1, 4.4, 6]} />
            <meshStandardMaterial color="#2c3840" roughness={0.7} metalness={0.3} />
          </mesh>
          <mesh position={[0.35, 4.35, 0]}>
            <boxGeometry args={[0.7, 0.12, 0.28]} />
            <meshStandardMaterial color="#1c242c" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.55, 4.22, 0]}>
            <boxGeometry args={[0.22, 0.08, 0.18]} />
            <meshStandardMaterial color="#d7f4ff" emissive="#9ad4ea" emissiveIntensity={0.8} />
          </mesh>
          <pointLight position={[0.55, 4.1, 0]} intensity={2.2} distance={16} color="#c8e8f4" />
        </group>
      ))}
    </group>
  );
}

const LIFT: Record<RoadRibbon['kind'], number> = {
  ring: 0,
  access: 0.025,
  spur: 0.05,
  active: 0.04,
};

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
            <RoadDeck ribbon={r} active={active} lift={LIFT[r.kind]} />
            {(r.kind === 'access' || r.kind === 'ring') && <RoadLamps ribbon={r} />}
          </group>
        );
      })}
    </group>
  );
}
