import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { distToRoads, shortestPathIds, type DrivePoint, type DriveRoad } from '../../lib/driveMap';
import type { DriveDifficulty } from '../../lib/driveMission';
import type { CoachAllow } from './DriveCoach';

export type DriveTelemetry = {
  speed: number;
  dist: number;
  heading: number;
  bearing: number;
  aligned: boolean;
  x: number;
  z: number;
  steered: boolean;
  onRoad: boolean;
  checkpointHits: string[];
};

type SceneProps = {
  points: DrivePoint[];
  roads: DriveRoad[];
  targetId: string | null;
  playing: boolean;
  difficulty: DriveDifficulty;
  allow: CoachAllow | 'all';
  onArrive: (aligned: boolean) => void;
  onTelemetry: (t: DriveTelemetry) => void;
  resetKey: number;
  checkpoints?: { id: string; x: number; z: number }[];
  /** Next amber gate; nav arrow aims here before the beacon. */
  navAim?: { x: number; z: number } | null;
};

function Ground() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(420, 42, '#1a3340', '#0f222c');
    g.position.y = 0.01;
    const mats = Array.isArray(g.material) ? g.material : [g.material];
    for (const m of mats) {
      const mat = m as THREE.Material & { opacity?: number; transparent?: boolean };
      mat.transparent = true;
      mat.opacity = 0.35;
    }
    return g;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.04, 0]}>
        <planeGeometry args={[560, 560]} />
        <meshStandardMaterial color="#0a1518" roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <circleGeometry args={[210, 64]} />
        <meshStandardMaterial color="#102018" roughness={0.95} metalness={0.04} />
      </mesh>
      <primitive object={grid} />
      {/* scrub / caliche patches */}
      {Array.from({ length: 55 }, (_, i) => {
        const a = (i * 2.713) % (Math.PI * 2);
        const r = 12 + ((i * 11) % 170);
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.03, Math.sin(a) * r]} rotation={[-Math.PI / 2, 0, a * 0.4]}>
            <circleGeometry args={[0.9 + (i % 6) * 0.4, 7]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#1a2c22' : '#15241c'} roughness={1} />
          </mesh>
        );
      })}
      {/* distant mesa silhouettes */}
      {[
        [90, -8, -120, 55, 14],
        [-110, -6, -95, 40, 11],
        [130, -10, 40, 48, 16],
        [-140, -9, 70, 60, 13],
      ].map(([x, y, z, w, h], i) => (
        <mesh key={`mesa-${i}`} position={[x, y + h / 2, z]} castShadow>
          <boxGeometry args={[w, h, w * 0.45]} />
          <meshStandardMaterial color="#0d1820" roughness={1} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function RoadMesh({
  road,
  active,
}: {
  road: DriveRoad;
  active: boolean;
}) {
  const width = road.kind === 'arterial' ? 5.2 : road.kind === 'spur' ? 3.8 : 2.4;
  const mid = useMemo(() => {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    return {
      len,
      angle,
      cx: (road.from[0] + road.to[0]) / 2,
      cz: (road.from[1] + road.to[1]) / 2,
      dx,
      dz,
    };
  }, [road]);

  const dashes = useMemo(() => {
    if (road.kind === 'lease' || mid.len < 8) return [] as number[];
    const n = Math.floor(mid.len / 5);
    return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  }, [mid.len, road.kind]);

  return (
    <group>
      <mesh position={[mid.cx, active ? 0.05 : 0.03, mid.cz]} rotation={[-Math.PI / 2, 0, -mid.angle]} receiveShadow>
        <planeGeometry args={[width + (active ? 0.8 : 0), mid.len]} />
        <meshStandardMaterial
          color={active ? '#243848' : road.kind === 'arterial' ? '#1a2834' : '#16222c'}
          roughness={0.82}
          metalness={active ? 0.28 : 0.12}
          emissive={active ? '#1a4050' : '#000000'}
          emissiveIntensity={active ? 0.45 : 0}
        />
      </mesh>
      {/* shoulder glow for active route */}
      {active && (
        <mesh position={[mid.cx, 0.06, mid.cz]} rotation={[-Math.PI / 2, 0, -mid.angle]}>
          <planeGeometry args={[width + 2.4, mid.len]} />
          <meshBasicMaterial color="#5ec8d8" transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}
      {dashes.map((t, i) => {
        const x = road.from[0] + mid.dx * t;
        const z = road.from[1] + mid.dz * t;
        return (
          <mesh key={i} position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, -mid.angle]}>
            <planeGeometry args={[0.28, 1.5]} />
            <meshBasicMaterial color={active ? '#9ae4ef' : '#3a4a55'} transparent opacity={active ? 0.9 : 0.45} />
          </mesh>
        );
      })}
    </group>
  );
}

function RouteChevrons({ roads, activeIds, target }: { roads: DriveRoad[]; activeIds: Set<string>; target: DrivePoint }) {
  const marks = useMemo(() => {
    const out: { x: number; z: number; angle: number }[] = [];
    for (const r of roads) {
      if (!activeIds.has(r.id)) continue;
      const dx = r.to[0] - r.from[0];
      const dz = r.to[1] - r.from[1];
      const len = Math.hypot(dx, dz) || 1;
      // orient chevrons toward the target end of the segment
      const dFrom = Math.hypot(r.from[0] - target.x, r.from[1] - target.z);
      const dTo = Math.hypot(r.to[0] - target.x, r.to[1] - target.z);
      const towardTo = dTo < dFrom;
      const sx = towardTo ? dx / len : -dx / len;
      const sz = towardTo ? dz / len : -dz / len;
      const angle = Math.atan2(sx, sz);
      const n = Math.max(2, Math.floor(len / 14));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        out.push({
          x: r.from[0] + dx * t,
          z: r.from[1] + dz * t,
          angle,
        });
      }
    }
    return out;
  }, [roads, activeIds, target]);

  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const pulse = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.25;
    for (const child of group.current.children) {
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = pulse;
    }
  });

  return (
    <group ref={group}>
      {marks.map((m, i) => (
        <mesh key={i} position={[m.x, 0.12, m.z]} rotation={[-Math.PI / 2, 0, -m.angle]}>
          <coneGeometry args={[0.55, 1.4, 3]} />
          <meshBasicMaterial color="#e8c07a" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function TargetBeacon({ point }: { point: DrivePoint }) {
  const beam = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const diamond = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(t * 2.2) * 0.06;
      beam.current.scale.x = 1 + Math.sin(t * 1.6) * 0.08;
      beam.current.scale.z = 1 + Math.sin(t * 1.6) * 0.08;
    }
    if (ringA.current) {
      ringA.current.position.y = 0.2 + ((t * 2.2) % 8);
      const mat = ringA.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.7 - ringA.current.position.y / 10);
      const s = 1 + ringA.current.position.y * 0.12;
      ringA.current.scale.set(s, s, s);
    }
    if (ringB.current) {
      ringB.current.position.y = 0.2 + (((t * 2.2) + 4) % 8);
      const mat = ringB.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.7 - ringB.current.position.y / 10);
      const s = 1 + ringB.current.position.y * 0.12;
      ringB.current.scale.set(s, s, s);
    }
    if (diamond.current) {
      diamond.current.position.y = 14 + Math.sin(t * 2) * 0.4;
      diamond.current.rotation.y = t * 1.4;
    }
  });

  return (
    <group position={[point.x, 0, point.z]}>
      {/* light shaft */}
      <mesh ref={beam} position={[0, 18, 0]}>
        <cylinderGeometry args={[0.6, 3.2, 36, 20, 1, true]} />
        <meshBasicMaterial color="#5ec8d8" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringA} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[4.8, 5.6, 40]} />
        <meshBasicMaterial color="#9ae4ef" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringB} rotation={[-Math.PI / 2, 0, 0]} position={[0, 4, 0]}>
        <ringGeometry args={[4.8, 5.6, 40]} />
        <meshBasicMaterial color="#7eb8ff" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={diamond} position={[0, 14, 0]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial color="#9ae4ef" emissive="#5ec8d8" emissiveIntensity={2.2} metalness={0.4} roughness={0.2} />
      </mesh>
      <pointLight position={[0, 10, 0]} intensity={40} distance={55} color="#5ec8d8" />
      <spotLight position={[0, 28, 0]} angle={0.35} penumbra={0.6} intensity={50} distance={70} color="#b5eef5" castShadow />
      <Html position={[0, 17, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
        <div className="drive-beacon-tag">Beacon · target</div>
      </Html>
    </group>
  );
}

function TankPad({ point, isTarget }: { point: DrivePoint; isTarget: boolean }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <circleGeometry args={[7, 28]} />
        <meshStandardMaterial color={isTarget ? '#1a3038' : '#141e26'} roughness={0.9} />
      </mesh>
      {/* bund wall */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
        <ringGeometry args={[6.2, 6.7, 28]} />
        <meshStandardMaterial color="#2a3844" metalness={0.3} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.4, 0]} castShadow>
        <cylinderGeometry args={[2.5, 2.5, 6.8, 28]} />
        <meshStandardMaterial color={isTarget ? '#4a6570' : '#2c3a44'} metalness={0.55} roughness={0.32} />
      </mesh>
      <mesh position={[0, 6.9, 0]} castShadow>
        <cylinderGeometry args={[2.65, 2.65, 0.35, 28]} />
        <meshStandardMaterial color="#1c2830" metalness={0.45} roughness={0.45} />
      </mesh>
      {/* stair tower */}
      <mesh position={[2.85, 3.4, 0]} castShadow>
        <boxGeometry args={[0.55, 6.8, 0.9]} />
        <meshStandardMaterial color="#5a6e78" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* pump skid */}
      <mesh position={[-4.2, 0.7, 2.4]} castShadow>
        <boxGeometry args={[2.2, 1.4, 1.6]} />
        <meshStandardMaterial color="#243038" metalness={0.35} roughness={0.55} />
      </mesh>
      {!isTarget && (
        <pointLight position={[0, 7.5, 0]} intensity={4} distance={16} color="#7a9aab" />
      )}
      <Html position={[0, 8.6, 0]} center distanceFactor={28} style={{ pointerEvents: 'none' }}>
        <div className={`drive-pin ${isTarget ? 'target' : ''}`}>{point.label}</div>
      </Html>
    </group>
  );
}

function Yard({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial color="#1c2832" roughness={0.88} metalness={0.1} />
      </mesh>
      {/* floodlight poles */}
      {([-8, 8] as const).map((x) => (
        <group key={x} position={[x, 0, -6]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.12, 0.18, 8, 8]} />
            <meshStandardMaterial color="#3a4a55" metalness={0.5} roughness={0.4} />
          </mesh>
          <pointLight position={[0, 7.5, 1]} intensity={12} distance={28} color="#dff6ff" />
        </group>
      ))}
      {[-6, 0, 6].map((x) => (
        <mesh key={x} position={[x, 1.2, -5.5]} castShadow>
          <boxGeometry args={[3.4, 2.4, 2.6]} />
          <meshStandardMaterial color="#243038" metalness={0.25} roughness={0.65} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 4.2, 28]} />
        <meshBasicMaterial color="#5ec8d8" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 4.2, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin yard">{point.label}</div>
      </Html>
    </group>
  );
}

function HubMarker({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[5, 24]} />
        <meshStandardMaterial color="#152028" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.55, 4.4, 8]} />
        <meshStandardMaterial color="#4a5a66" metalness={0.4} roughness={0.45} />
      </mesh>
      <mesh position={[0, 4.6, 0]}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshStandardMaterial color="#7eb8ff" emissive="#7eb8ff" emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 5, 0]} intensity={10} distance={22} color="#7eb8ff" />
      <Html position={[0, 6.2, 0]} center distanceFactor={32} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin hub">{point.label}</div>
      </Html>
    </group>
  );
}

function Disposal({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[5.5, 20]} />
        <meshStandardMaterial color="#1a2218" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[3.2, 3.4, 2.2, 20]} />
        <meshStandardMaterial color="#2a3830" metalness={0.2} roughness={0.7} />
      </mesh>
      <Html position={[0, 3.2, 0]} center distanceFactor={32} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin">{point.label}</div>
      </Html>
    </group>
  );
}

function RoadLamps({ roads, activeIds }: { roads: DriveRoad[]; activeIds: Set<string> }) {
  const lamps = useMemo(() => {
    const out: { x: number; z: number; active: boolean }[] = [];
    for (const r of roads) {
      if (r.kind === 'lease') continue;
      const dx = r.to[0] - r.from[0];
      const dz = r.to[1] - r.from[1];
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const n = Math.max(1, Math.floor(len / 22));
      const active = activeIds.has(r.id);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        out.push({
          x: r.from[0] + dx * t + px * 2.6,
          z: r.from[1] + dz * t + pz * 2.6,
          active,
        });
      }
    }
    return out;
  }, [roads, activeIds]);

  return (
    <group>
      {lamps.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 4.8, 6]} />
            <meshStandardMaterial color="#2a3840" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 4.85, 0]}>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshStandardMaterial
              color={l.active ? '#dff6ff' : '#8aa0aa'}
              emissive={l.active ? '#9ae4ef' : '#405058'}
              emissiveIntensity={l.active ? 1.6 : 0.4}
            />
          </mesh>
          {l.active && <pointLight position={[0, 4.7, 0]} intensity={6} distance={14} color="#c8f0f8" />}
        </group>
      ))}
    </group>
  );
}

function Moon() {
  return (
    <group position={[-60, 55, -80]}>
      <mesh>
        <sphereGeometry args={[6, 24, 24]} />
        <meshBasicMaterial color="#dce9f0" />
      </mesh>
      <pointLight intensity={18} distance={400} color="#a8c4d4" />
    </group>
  );
}

function normAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function CheckpointGate({
  cp,
  hit,
  label,
  next,
}: {
  cp: { id: string; x: number; z: number };
  hit: boolean;
  label: string;
  next: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current || hit) return;
    ring.current.rotation.y = clock.elapsedTime * 1.2;
    const pulse = next ? 1 + Math.sin(clock.elapsedTime * 4) * 0.08 : 1;
    ring.current.scale.setScalar(pulse);
  });
  return (
    <group position={[cp.x, 0, cp.z]}>
      <mesh ref={ring} position={[0, 2.2, 0]}>
        <torusGeometry args={[3.2, 0.14, 8, 28]} />
        <meshBasicMaterial color={hit ? '#7dcea0' : next ? '#ffd27a' : '#e8c07a'} transparent opacity={hit ? 0.35 : 0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[2.6, 3.4, 28]} />
        <meshBasicMaterial
          color={hit ? '#7dcea0' : next ? '#ffd27a' : '#e8c07a'}
          transparent
          opacity={hit ? 0.25 : next ? 0.7 : 0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      {!hit && <pointLight position={[0, 3, 0]} intensity={next ? 14 : 8} distance={18} color="#e8c07a" />}
      <Html position={[0, 5.2, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <div className={`drive-pin ${hit ? 'yard' : 'target'}`}>{hit ? 'Cleared' : label}</div>
      </Html>
    </group>
  );
}

function NavArrow({
  poseRef,
  target,
  nextGate,
}: {
  poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null>;
  target: DrivePoint | null;
  nextGate: { x: number; z: number } | null;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!group.current || !poseRef.current || !target) {
      if (group.current) group.current.visible = false;
      return;
    }
    const s = poseRef.current;
    const aim = nextGate ?? { x: target.x, z: target.z };
    const dist = Math.hypot(aim.x - s.x, aim.z - s.z);
    if (dist < (nextGate ? 5 : 10)) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const bearing = Math.atan2(aim.x - s.x, aim.z - s.z);
    const ahead = 8;
    group.current.position.set(
      s.x + Math.sin(bearing) * ahead,
      2.6 + Math.sin(performance.now() * 0.004) * 0.2,
      s.z + Math.cos(bearing) * ahead,
    );
    group.current.rotation.y = bearing;
    if (mat.current) mat.current.color.set(nextGate ? '#e8c07a' : '#5ec8d8');
  });
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.6, 1.7, 3]} />
        <meshBasicMaterial ref={mat} color="#5ec8d8" />
      </mesh>
      <pointLight intensity={7} distance={14} color="#5ec8d8" />
    </group>
  );
}

function Truck({
  points,
  roads,
  targetId,
  playing,
  difficulty,
  allow,
  onArrive,
  onTelemetry,
  resetKey,
  checkpoints = [],
  poseRef,
}: SceneProps & { poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null> }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const keys = useRef({ f: false, b: false, l: false, r: false });
  const state = useRef({
    x: 0, z: 0, yaw: 0, speed: 0, arrived: false, steered: false, yawAtReset: 0,
    hits: new Set<string>(),
  });
  const camTarget = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  const telemAcc = useRef(0);
  const allowRef = useRef(allow);
  const diffRef = useRef(difficulty);
  const roadsRef = useRef(roads);
  const cpsRef = useRef(checkpoints);
  allowRef.current = allow;
  diffRef.current = difficulty;
  roadsRef.current = roads;
  cpsRef.current = checkpoints;
  const [ready, setReady] = useState(false);
  const [hitIds, setHitIds] = useState<string[]>([]);

  const yard = points.find((p) => p.kind === 'yard');
  const target = points.find((p) => p.id === targetId) ?? null;

  useEffect(() => {
    const permitted = (code: string) => {
      const a = allowRef.current;
      if (a === 'all') return true;
      if (code === 'KeyW' || code === 'ArrowUp') return !!a.f;
      if (code === 'KeyS' || code === 'ArrowDown') return !!a.b;
      if (code === 'KeyA' || code === 'ArrowLeft') return !!a.l;
      if (code === 'KeyD' || code === 'ArrowRight') return !!a.r;
      return false;
    };
    const down = (e: KeyboardEvent) => {
      if (!permitted(e.code)) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.f = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.b = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.l = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.r = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.f = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.b = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.l = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.r = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    keys.current = { f: false, b: false, l: false, r: false };
    state.current.steered = false;
    state.current.yawAtReset = state.current.yaw;
  }, [allow]);

  useEffect(() => {
    if (!yard) return;
    state.current = {
      x: yard.x, z: yard.z + 4, yaw: 0, speed: 0, arrived: false, steered: false, yawAtReset: 0,
      hits: new Set(),
    };
    poseRef.current = { x: yard.x, z: yard.z + 4, yaw: 0 };
    setHitIds([]);
    setReady(true);
  }, [yard, resetKey, poseRef]);

  useFrame((_, dt) => {
    if (!group.current || !ready) return;
    const s = state.current;
    const d = diffRef.current;
    const a = allowRef.current;
    const clamped = Math.min(dt, 0.05);
    const can = (k: keyof CoachAllow) => a === 'all' || !!a[k];

    if (playing && !s.arrived) {
      if (keys.current.f && can('f')) s.speed = Math.min(d.maxSpeed, s.speed + d.accel * clamped);
      else if (keys.current.b && can('b')) s.speed = Math.max(-d.maxSpeed * 0.45, s.speed - 28 * clamped);
      else {
        if (s.speed > 0) s.speed = Math.max(0, s.speed - 6 * clamped);
        if (s.speed < 0) s.speed = Math.min(0, s.speed + 6 * clamped);
      }
      const steerAmt = (keys.current.l && can('l') ? 1 : 0) - (keys.current.r && can('r') ? 1 : 0);
      if (Math.abs(s.speed) > 0.4 && steerAmt !== 0) {
        s.yaw += steerAmt * d.steer * (s.speed / d.maxSpeed) * clamped;
        if (Math.abs(s.yaw - s.yawAtReset) > 0.35) s.steered = true;
      }
      // soft scrub when cutting across scrub — rewards staying on lit roads
      const roadDistNow = distToRoads(s.x, s.z, roadsRef.current);
      if (roadDistNow > 4.2 && Math.abs(s.speed) > 0.5) {
        s.speed *= Math.pow(0.55, clamped);
      }

      s.x += Math.sin(s.yaw) * s.speed * clamped;
      s.z += Math.cos(s.yaw) * s.speed * clamped;
      s.x = THREE.MathUtils.clamp(s.x, -200, 200);
      s.z = THREE.MathUtils.clamp(s.z, -200, 200);

      let newHit = false;
      for (const cp of cpsRef.current) {
        if (s.hits.has(cp.id)) continue;
        if (Math.hypot(s.x - cp.x, s.z - cp.z) < 4.2) {
          s.hits.add(cp.id);
          newHit = true;
        }
      }
      if (newHit) setHitIds([...s.hits]);

      if (target) {
        const dist = Math.hypot(s.x - target.x, s.z - target.z);
        if (dist < d.arriveR) {
          s.arrived = true;
          s.speed = 0;
          const bearing = Math.atan2(target.x - s.x, target.z - s.z);
          const aligned = Math.abs(normAngle(bearing - s.yaw)) < 0.55;
          onArrive(aligned);
        }
      }
    }

    poseRef.current = { x: s.x, z: s.z, yaw: s.yaw };
    group.current.position.set(s.x, 0, s.z);
    group.current.rotation.y = s.yaw;

    camTarget.current.set(s.x - Math.sin(s.yaw) * 14, 7.5, s.z - Math.cos(s.yaw) * 14);
    camera.position.lerp(camTarget.current, 1 - Math.pow(0.001, clamped));
    lookAt.current.set(s.x, 2.2, s.z);
    camera.lookAt(lookAt.current);

    telemAcc.current += clamped;
    if (telemAcc.current >= 0.08) {
      telemAcc.current = 0;
      const bearing = target ? Math.atan2(target.x - s.x, target.z - s.z) : s.yaw;
      const aligned = Math.abs(normAngle(bearing - s.yaw)) < 0.4;
      const dist = target ? Math.hypot(s.x - target.x, s.z - target.z) : 0;
      const roadDist = distToRoads(s.x, s.z, roadsRef.current);
      onTelemetry({
        speed: Math.abs(s.speed),
        dist,
        heading: s.yaw,
        bearing,
        aligned,
        x: s.x,
        z: s.z,
        steered: s.steered,
        onRoad: roadDist < 4.2,
        checkpointHits: [...s.hits],
      });
    }
  });

  return (
    <>
      {checkpoints.map((cp, i) => {
        const hit = hitIds.includes(cp.id);
        const next = !hit && checkpoints.findIndex((c) => !hitIds.includes(c.id)) === i;
        return (
          <CheckpointGate
            key={cp.id}
            cp={cp}
            hit={hit}
            next={next}
            label={`Gate ${i + 1}/${checkpoints.length}`}
          />
        );
      })}
      <group ref={group}>
        <mesh position={[0, 1.35, 0.9]} castShadow>
          <boxGeometry args={[2.2, 1.5, 2.2]} />
          <meshStandardMaterial color="#5ec8d8" metalness={0.35} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.45, -2.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[1.05, 1.05, 4.6, 16]} />
          <meshStandardMaterial color="#2c3a44" metalness={0.55} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.55, -0.6]} castShadow>
          <boxGeometry args={[2.0, 0.35, 6.2]} />
          <meshStandardMaterial color="#121a20" metalness={0.4} roughness={0.6} />
        </mesh>
        {[
          [1.05, 0.45, 1.4], [-1.05, 0.45, 1.4],
          [1.05, 0.45, -1.2], [-1.05, 0.45, -1.2],
          [1.05, 0.45, -3.4], [-1.05, 0.45, -3.4],
        ].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.35, 12]} />
            <meshStandardMaterial color="#0a0e12" roughness={0.9} />
          </mesh>
        ))}
        <spotLight position={[0, 1.4, 2.2]} angle={0.45} penumbra={0.5} intensity={28} distance={45} color="#dff6ff" castShadow />
      </group>
    </>
  );
}

function WorldInner(props: SceneProps) {
  const yard = props.points.find((p) => p.kind === 'yard');
  const hub = props.points.find((p) => p.kind === 'hub');
  const tanks = props.points.filter((p) => p.kind === 'tank');
  const disposal = props.points.find((p) => p.kind === 'disposal');
  const target = props.points.find((p) => p.id === props.targetId) ?? null;
  const fog = props.difficulty;
  const poseRef = useRef<{ x: number; z: number; yaw: number } | null>(null);

  const activeIds = useMemo(() => {
    if (!yard || !props.targetId) return new Set<string>();
    return shortestPathIds(props.roads, yard.id, props.targetId);
  }, [props.roads, yard, props.targetId]);

  return (
    <>
      <color attach="background" args={['#050c14']} />
      <fog attach="fog" args={['#050c14', fog.fogNear, fog.fogFar]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[35, 50, 15]} intensity={0.4} castShadow color="#9bb4c4" />
      <hemisphereLight args={['#2a4050', '#081010', 0.4]} />
      <Stars radius={200} depth={70} count={2200} factor={3.2} saturation={0.15} fade speed={0.35} />
      <Moon />
      <Ground />
      {props.roads.map((r) => (
        <RoadMesh key={r.id} road={r} active={activeIds.has(r.id)} />
      ))}
      <RoadLamps roads={props.roads} activeIds={activeIds} />
      {target && <RouteChevrons roads={props.roads} activeIds={activeIds} target={target} />}
      {yard && <Yard point={yard} />}
      {hub && <HubMarker point={hub} />}
      {disposal && <Disposal point={disposal} />}
      {tanks.map((t) => (
        <TankPad key={t.id} point={t} isTarget={t.id === props.targetId} />
      ))}
      {target && <TargetBeacon point={target} />}
      <Truck {...props} poseRef={poseRef} />
      <NavArrow poseRef={poseRef} target={target} nextGate={props.navAim ?? null} />
    </>
  );
}

export function DriveScene(props: SceneProps) {
  return (
    <Canvas shadows camera={{ position: [0, 12, 18], fov: 55, near: 0.1, far: 450 }} dpr={[1, 1.75]}>
      <WorldInner {...props} />
    </Canvas>
  );
}
