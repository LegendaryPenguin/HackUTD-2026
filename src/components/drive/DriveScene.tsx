import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type DrivePoint, type DriveRoad } from '../../lib/driveMap';
import type { DeliveryStop, DriveDifficulty } from '../../lib/driveMission';
import { getYardPose, isOnRoad, type RoadRibbon } from '../../lib/driveRoads';
import {
  buildNatureProps,
  DriveWorld,
  natureBlockersFromProps,
  type NatureBlocker,
} from './DriveWorld';
import { PlantRoads } from './PlantRoads';

const TRUCK_RADIUS = 2.1;

function resolveBlockers(x: number, z: number, blockers: NatureBlocker[]): { x: number; z: number; hit: boolean } {
  let nx = x;
  let nz = z;
  let hit = false;
  for (const b of blockers) {
    const dx = nx - b.x;
    const dz = nz - b.z;
    const d = Math.hypot(dx, dz);
    const need = b.r + TRUCK_RADIUS;
    if (d >= need || d < 1e-4) continue;
    const push = (need - d) / d;
    nx += dx * push;
    nz += dz * push;
    hit = true;
  }
  return { x: nx, z: nz, hit };
}

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
  /** Delivered pad ids */
  padHits: string[];
};

type SceneProps = {
  points: DrivePoint[];
  roads: DriveRoad[];
  ribbons: RoadRibbon[];
  /** Ordered tank delivery pads */
  stops: DeliveryStop[];
  playing: boolean;
  difficulty: DriveDifficulty;
  onArrive: () => void;
  onTelemetry: (t: DriveTelemetry) => void;
  resetKey: number;
};

function TargetBeacon({ point, label }: { point: DrivePoint; label: string }) {
  const beam = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const diamond = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(t * 2.2) * 0.06;
    }
    if (ringA.current) {
      ringA.current.position.y = 0.2 + ((t * 2.2) % 8);
      const mat = ringA.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.7 - ringA.current.position.y / 10);
      const s = 1 + ringA.current.position.y * 0.12;
      ringA.current.scale.set(s, s, s);
    }
    if (diamond.current) {
      diamond.current.position.y = 14 + Math.sin(t * 2) * 0.4;
      diamond.current.rotation.y = t * 1.4;
    }
  });

  return (
    <group position={[point.x, 0, point.z]}>
      <mesh ref={beam} position={[0, 18, 0]}>
        <cylinderGeometry args={[0.6, 3.2, 36, 16, 1, true]} />
        <meshBasicMaterial color="#5ec8d8" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringA} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[4.8, 5.6, 32]} />
        <meshBasicMaterial color="#9ae4ef" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={diamond} position={[0, 14, 0]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial color="#9ae4ef" emissive="#5ec8d8" emissiveIntensity={2.2} metalness={0.4} roughness={0.2} />
      </mesh>
      <pointLight position={[0, 10, 0]} intensity={28} distance={48} color="#5ec8d8" />
      <Html position={[0, 17, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
        <div className="drive-beacon-tag">Deliver · {label}</div>
      </Html>
    </group>
  );
}

function TankPad({
  point,
  isNext,
  delivered,
  showLabel,
}: {
  point: DrivePoint;
  isNext: boolean;
  delivered: boolean;
  showLabel: boolean;
}) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <circleGeometry args={[7, 20]} />
        <meshStandardMaterial
          color={delivered ? '#1a2e28' : isNext ? '#1a3038' : '#141e26'}
          roughness={0.9}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
        <ringGeometry args={[6.2, 6.7, 20]} />
        <meshStandardMaterial
          color={delivered ? '#2a4840' : isNext ? '#3a5048' : '#2a3844'}
          metalness={0.3}
          roughness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 3.4, 0]} castShadow>
        <cylinderGeometry args={[2.5, 2.5, 6.8, 20]} />
        <meshStandardMaterial
          color={delivered ? '#3a5a50' : isNext ? '#4a6570' : '#2c3a44'}
          metalness={0.55}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 6.9, 0]} castShadow>
        <cylinderGeometry args={[2.65, 2.65, 0.35, 20]} />
        <meshStandardMaterial color="#1c2830" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[2.85, 3.4, 0]} castShadow>
        <boxGeometry args={[0.55, 6.8, 0.9]} />
        <meshStandardMaterial color="#5a6e78" metalness={0.5} roughness={0.4} />
      </mesh>
      {(isNext || delivered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[7.2, 8.1, 28]} />
          <meshBasicMaterial
            color={delivered ? '#7dcea0' : '#5ec8d8'}
            transparent
            opacity={delivered ? 0.35 : 0.65}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {showLabel && (
        <Html position={[0, 8.6, 0]} center distanceFactor={28} style={{ pointerEvents: 'none' }}>
          <div className={`drive-pin ${delivered ? 'yard' : isNext ? 'target' : ''}`}>
            {delivered ? `✓ ${point.label}` : point.label}
          </div>
        </Html>
      )}
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
      {([-8, 8] as const).map((x) => (
        <group key={x} position={[x, 0, -6]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.12, 0.18, 8, 6]} />
            <meshStandardMaterial color="#3a4a55" metalness={0.5} roughness={0.4} />
          </mesh>
          <pointLight position={[0, 7.5, 1]} intensity={8} distance={22} color="#dff6ff" />
        </group>
      ))}
      {[-6, 0, 6].map((x) => (
        <mesh key={x} position={[x, 1.2, -5.5]} castShadow>
          <boxGeometry args={[3.4, 2.4, 2.6]} />
          <meshStandardMaterial color="#243038" metalness={0.25} roughness={0.65} />
        </mesh>
      ))}
      <Html position={[0, 4.2, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin yard">{point.label}</div>
      </Html>
    </group>
  );
}

function Disposal({ point }: { point: DrivePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[5.5, 16]} />
        <meshStandardMaterial color="#1a2218" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[3.2, 3.4, 2.2, 16]} />
        <meshStandardMaterial color="#2a3830" metalness={0.2} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Moon() {
  return (
    <group position={[-60, 55, -80]}>
      <mesh>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#dce9f0" />
      </mesh>
      <pointLight intensity={14} distance={360} color="#a8c4d4" />
    </group>
  );
}

function normAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function NavArrow({
  poseRef,
  aim,
}: {
  poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null>;
  aim: { x: number; z: number } | null;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current || !poseRef.current || !aim) {
      if (group.current) group.current.visible = false;
      return;
    }
    const s = poseRef.current;
    const dist = Math.hypot(aim.x - s.x, aim.z - s.z);
    if (dist < 9) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const bearing = Math.atan2(aim.x - s.x, aim.z - s.z);
    const ahead = 8;
    group.current.position.set(
      s.x + Math.sin(bearing) * ahead,
      2.6 + Math.sin(performance.now() * 0.004) * 0.15,
      s.z + Math.cos(bearing) * ahead,
    );
    group.current.rotation.y = bearing;
  });
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.6, 1.7, 3]} />
        <meshBasicMaterial color="#5ec8d8" />
      </mesh>
    </group>
  );
}

function Truck({
  points,
  ribbons,
  stops,
  playing,
  difficulty,
  onArrive,
  onTelemetry,
  resetKey,
  poseRef,
  onPadHits,
  blockers,
}: SceneProps & {
  poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number } | null>;
  onPadHits: (ids: string[]) => void;
  blockers: NatureBlocker[];
}) {
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
  const diffRef = useRef(difficulty);
  const ribbonsRef = useRef(ribbons);
  const stopsRef = useRef(stops);
  const pointsRef = useRef(points);
  const blockersRef = useRef(blockers);
  diffRef.current = difficulty;
  ribbonsRef.current = ribbons;
  stopsRef.current = stops;
  pointsRef.current = points;
  blockersRef.current = blockers;
  const [ready, setReady] = useState(false);

  const yard = points.find((p) => p.kind === 'yard');

  const nextStop = useMemo(() => {
    // initial only — live next tracked via hits in frame
    return stops[0] ?? null;
  }, [stops]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
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
    if (!yard) return;
    const pose = getYardPose(ribbonsRef.current);
    state.current = {
      x: pose.x, z: pose.z, yaw: pose.yaw, speed: 0, arrived: false, steered: false, yawAtReset: pose.yaw,
      hits: new Set(),
    };
    poseRef.current = { x: pose.x, z: pose.z, yaw: pose.yaw };
    onPadHits([]);
    setReady(true);
  }, [yard, resetKey, poseRef, ribbons, onPadHits]);

  useFrame((_, dt) => {
    if (!group.current || !ready) return;
    const s = state.current;
    const d = diffRef.current;
    const clamped = Math.min(dt, 0.05);

    const next = stopsRef.current.find((st) => !s.hits.has(st.id)) ?? null;
    const nextPt = next
      ? pointsRef.current.find((p) => p.id === next.facilityId) ?? null
      : null;

    if (playing && !s.arrived) {
      if (keys.current.f) s.speed = Math.min(d.maxSpeed, s.speed + d.accel * clamped);
      else if (keys.current.b) s.speed = Math.max(-d.maxSpeed * 0.45, s.speed - 28 * clamped);
      else {
        if (s.speed > 0) s.speed = Math.max(0, s.speed - 6 * clamped);
        if (s.speed < 0) s.speed = Math.min(0, s.speed + 6 * clamped);
      }
      const steerAmt = (keys.current.l ? 1 : 0) - (keys.current.r ? 1 : 0);
      if (Math.abs(s.speed) > 0.4 && steerAmt !== 0) {
        s.yaw += steerAmt * d.steer * (s.speed / d.maxSpeed) * clamped;
        if (Math.abs(s.yaw - s.yawAtReset) > 0.35) s.steered = true;
      }
      const onPavement = isOnRoad(s.x, s.z, ribbonsRef.current, 1.2);
      if (!onPavement && Math.abs(s.speed) > 0.4) {
        s.speed *= Math.pow(0.55, clamped);
      }

      const nx = s.x + Math.sin(s.yaw) * s.speed * clamped;
      const nz = s.z + Math.cos(s.yaw) * s.speed * clamped;
      const resolved = resolveBlockers(nx, nz, blockersRef.current);
      if (resolved.hit) {
        s.speed *= Math.pow(0.12, clamped);
      }
      s.x = THREE.MathUtils.clamp(resolved.x, -260, 260);
      s.z = THREE.MathUtils.clamp(resolved.z, -260, 260);

      // Must deliver in order — only the next pad counts
      if (next && nextPt && Math.hypot(s.x - nextPt.x, s.z - nextPt.z) < d.arriveR) {
        s.hits.add(next.id);
        onPadHits([...s.hits]);
        const remaining = stopsRef.current.filter((st) => !s.hits.has(st.id));
        if (remaining.length === 0) {
          s.arrived = true;
          s.speed = 0;
          onArrive();
        }
      }
    }

    poseRef.current = { x: s.x, z: s.z, yaw: s.yaw };
    group.current.position.set(s.x, 0, s.z);
    group.current.rotation.y = s.yaw;

    camTarget.current.set(s.x - Math.sin(s.yaw) * 15, 8.2, s.z - Math.cos(s.yaw) * 15);
    camera.position.lerp(camTarget.current, 1 - Math.pow(0.002, clamped));
    lookAt.current.set(s.x, 2.2, s.z);
    camera.lookAt(lookAt.current);

    telemAcc.current += clamped;
    if (telemAcc.current >= 0.1) {
      telemAcc.current = 0;
      const bearing = nextPt ? Math.atan2(nextPt.x - s.x, nextPt.z - s.z) : s.yaw;
      const aligned = Math.abs(normAngle(bearing - s.yaw)) < 0.4;
      const dist = nextPt ? Math.hypot(s.x - nextPt.x, s.z - nextPt.z) : 0;
      onTelemetry({
        speed: Math.abs(s.speed),
        dist,
        heading: s.yaw,
        bearing,
        aligned,
        x: s.x,
        z: s.z,
        steered: s.steered,
        onRoad: isOnRoad(s.x, s.z, ribbonsRef.current, 1.2),
        padHits: [...s.hits],
      });
    }
  });

  void nextStop;

  return (
    <group ref={group}>
      <mesh position={[0, 1.35, 0.9]} castShadow>
        <boxGeometry args={[2.2, 1.5, 2.2]} />
        <meshStandardMaterial color="#7ad4e4" emissive="#2a6070" emissiveIntensity={0.45} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.45, -2.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.05, 1.05, 4.6, 14]} />
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
          <cylinderGeometry args={[0.45, 0.45, 0.35, 10]} />
          <meshStandardMaterial color="#0a0e12" roughness={0.9} />
        </mesh>
      ))}
      <spotLight position={[0, 1.4, 2.2]} angle={0.45} penumbra={0.5} intensity={18} distance={40} color="#dff6ff" />
    </group>
  );
}

function WorldInner(props: SceneProps) {
  const yard = props.points.find((p) => p.kind === 'yard');
  const tanks = props.points.filter((p) => p.kind === 'tank');
  const disposals = props.points.filter((p) => p.kind === 'disposal');
  const poseRef = useRef<{ x: number; z: number; yaw: number } | null>(null);
  const [hitIds, setHitIds] = useState<string[]>([]);

  const natureProps = useMemo(
    () => buildNatureProps(props.roads, props.points),
    [props.roads, props.points],
  );
  const blockers = useMemo(() => natureBlockersFromProps(natureProps), [natureProps]);

  const nextStop = props.stops.find((s) => !hitIds.includes(s.id)) ?? null;
  const nextPt = nextStop
    ? props.points.find((p) => p.id === nextStop.facilityId) ?? null
    : null;
  const stopFacilityIds = useMemo(
    () => new Set(props.stops.map((s) => s.facilityId)),
    [props.stops],
  );

  return (
    <>
      <color attach="background" args={['#152a3c']} />
      <fog attach="fog" args={['#1a3040', props.difficulty.fogNear, props.difficulty.fogFar]} />
      <ambientLight intensity={0.72} />
      <directionalLight position={[50, 70, 25]} intensity={1.0} color="#e8f0f8" />
      <hemisphereLight args={['#7a9ab0', '#2a3a28', 0.85]} />
      <Stars radius={280} depth={80} count={900} factor={2.6} saturation={0.1} fade speed={0.2} />
      <Moon />
      <DriveWorld roads={props.roads} points={props.points} natureProps={natureProps} />
      <PlantRoads
        ribbons={props.ribbons}
        points={props.points}
        targetId={nextStop?.facilityId ?? null}
      />
      {yard && <Yard point={yard} />}
      {disposals.map((d) => (
        <Disposal key={d.id} point={d} />
      ))}
      {tanks.map((t) => {
        const stop = props.stops.find((s) => s.facilityId === t.id);
        const delivered = stop ? hitIds.includes(stop.id) : false;
        const isNext = stop?.id === nextStop?.id;
        return (
          <TankPad
            key={t.id}
            point={t}
            isNext={!!isNext}
            delivered={delivered}
            showLabel={stopFacilityIds.has(t.id)}
          />
        );
      })}
      {nextPt && nextStop && <TargetBeacon point={nextPt} label={nextStop.label} />}
      <Truck {...props} poseRef={poseRef} onPadHits={setHitIds} blockers={blockers} />
      <NavArrow poseRef={poseRef} aim={nextPt} />
    </>
  );
}

export function DriveScene(props: SceneProps) {
  return (
    <Canvas
      shadows={false}
      camera={{ position: [0, 14, 20], fov: 55, near: 0.1, far: 520 }}
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
    >
      <WorldInner {...props} />
    </Canvas>
  );
}
