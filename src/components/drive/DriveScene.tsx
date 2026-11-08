/**
 * Avon Drive arena — self-contained arcade driving shell
 * (OSS kart/racing pattern: kinematic chassis + chase cam + asphalt track),
 * with Night Tide delivery pads layered on top.
 */
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
  type NatureProp,
} from './DriveWorld';
import { PlantRoads } from './PlantRoads';

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
  padHits: string[];
};

type SceneProps = {
  points: DrivePoint[];
  roads: DriveRoad[];
  ribbons: RoadRibbon[];
  stops: DeliveryStop[];
  playing: boolean;
  difficulty: DriveDifficulty;
  onArrive: () => void;
  onTelemetry: (t: DriveTelemetry) => void;
  resetKey: number;
  lessonOpen?: boolean;
};

const TRUCK_R = 2.2;

function normAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function resolveBlockers(x: number, z: number, blockers: NatureBlocker[], tankHard: { x: number; z: number; r: number }[]) {
  let nx = x;
  let nz = z;
  let hit = false;
  const all = [...blockers, ...tankHard];
  for (const b of all) {
    const dx = nx - b.x;
    const dz = nz - b.z;
    const d = Math.hypot(dx, dz);
    const need = b.r + TRUCK_R;
    if (d >= need || d < 1e-4) continue;
    const push = (need - d) / d;
    nx += dx * push;
    nz += dz * push;
    hit = true;
  }
  return { x: nx, z: nz, hit };
}

function TargetBeacon({ point, label }: { point: DrivePoint; label: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const diamond = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.position.y = 0.25 + ((t * 2) % 7);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - ring.current.position.y / 9);
      const s = 1 + ring.current.position.y * 0.1;
      ring.current.scale.set(s, s, s);
    }
    if (diamond.current) {
      diamond.current.position.y = 13 + Math.sin(t * 2) * 0.35;
      diamond.current.rotation.y = t * 1.3;
    }
  });
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6, 7, 32]} />
        <meshBasicMaterial color="#9ae4ef" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={diamond} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshBasicMaterial color="#9ae4ef" />
      </mesh>
      <pointLight position={[0, 10, 0]} intensity={30} distance={50} color="#5ec8d8" />
      <Html position={[0, 16, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
        <div className="drive-beacon-tag">Deliver · {label}</div>
      </Html>
    </group>
  );
}

function TankPad({
  point, isNext, delivered, showLabel,
}: {
  point: DrivePoint; isNext: boolean; delivered: boolean; showLabel: boolean;
}) {
  return (
    <group position={[point.x, 0, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[10, 28]} />
        <meshBasicMaterial color={delivered ? '#1a2e28' : isNext ? '#1a3038' : '#161c22'} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
        <ringGeometry args={[9, 10.2, 36]} />
        <meshBasicMaterial
          color={delivered ? '#7dcea0' : isNext ? '#5ec8d8' : '#3a4a54'}
          transparent
          opacity={delivered ? 0.45 : isNext ? 0.85 : 0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 6.8, 20]} />
        <meshStandardMaterial
          color={delivered ? '#3a5a50' : isNext ? '#4a6570' : '#2c3a44'}
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 6.9, 0]}>
        <cylinderGeometry args={[2.65, 2.65, 0.35, 20]} />
        <meshStandardMaterial color="#1c2830" metalness={0.4} roughness={0.5} />
      </mesh>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <planeGeometry args={[24, 18]} />
        <meshBasicMaterial color="#1c2832" />
      </mesh>
      <Html position={[0, 4, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <div className="drive-pin yard">{point.label}</div>
      </Html>
    </group>
  );
}

function Moon() {
  return (
    <group position={[-60, 55, -80]}>
      <mesh>
        <sphereGeometry args={[6, 12, 12]} />
        <meshBasicMaterial color="#dce9f0" />
      </mesh>
      <pointLight intensity={12} distance={340} color="#a8c4d4" />
    </group>
  );
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
    if (dist < 11) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const bearing = Math.atan2(aim.x - s.x, aim.z - s.z);
    group.current.position.set(s.x + Math.sin(bearing) * 8, 2.5, s.z + Math.cos(bearing) * 8);
    group.current.rotation.y = bearing;
  });
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.65, 1.8, 3]} />
        <meshBasicMaterial color="#5ec8d8" />
      </mesh>
    </group>
  );
}

/** Stable arcade chassis — no physics engine, no vibration. */
function Truck({
  ribbons,
  stops,
  points,
  playing,
  difficulty,
  onArrive,
  onTelemetry,
  resetKey,
  poseRef,
  onPadHits,
  lessonOpen,
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
    x: 0, z: 0, yaw: 0, speed: 0, steered: false, yawAtReset: 0, arrived: false,
    hits: new Set<string>(),
  });
  const camTarget = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  const telemAcc = useRef(0);
  const ribbonsRef = useRef(ribbons);
  const stopsRef = useRef(stops);
  const pointsRef = useRef(points);
  const diffRef = useRef(difficulty);
  const blockersRef = useRef(blockers);
  const lessonRef = useRef(!!lessonOpen);
  ribbonsRef.current = ribbons;
  stopsRef.current = stops;
  pointsRef.current = points;
  diffRef.current = difficulty;
  blockersRef.current = blockers;
  lessonRef.current = !!lessonOpen;

  const tankHard = useMemo(
    () => points.filter((p) => p.kind === 'tank').map((p) => ({ x: p.x, z: p.z, r: 3.2 })),
    [points],
  );
  const tankHardRef = useRef(tankHard);
  tankHardRef.current = tankHard;

  const yard = points.find((p) => p.kind === 'yard');

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
    const pose = getYardPose(ribbonsRef.current);
    state.current = {
      x: pose.x, z: pose.z, yaw: pose.yaw, speed: 0, steered: false, yawAtReset: pose.yaw, arrived: false,
      hits: new Set(),
    };
    poseRef.current = { x: pose.x, z: pose.z, yaw: pose.yaw };
    onPadHits([]);
  }, [resetKey, poseRef, ribbons, onPadHits, yard]);

  useFrame((_, dt) => {
    if (!group.current) return;
    const clamped = Math.min(dt, 0.05);
    const s = state.current;
    const d = diffRef.current;
    const next = stopsRef.current.find((st) => !s.hits.has(st.id)) ?? null;
    const nextPt = next
      ? pointsRef.current.find((p) => p.id === next.facilityId) ?? null
      : null;
    const nearPad = nextPt ? Math.hypot(s.x - nextPt.x, s.z - nextPt.z) < d.arriveR + 10 : false;
    const onPavement = isOnRoad(s.x, s.z, ribbonsRef.current, 1.8) || nearPad;

    if (playing && !s.arrived && !lessonRef.current) {
      if (keys.current.f) s.speed = Math.min(d.maxSpeed, s.speed + d.accel * clamped);
      else if (keys.current.b) s.speed = Math.max(-d.maxSpeed * 0.45, s.speed - 26 * clamped);
      else {
        if (s.speed > 0) s.speed = Math.max(0, s.speed - 8 * clamped);
        if (s.speed < 0) s.speed = Math.min(0, s.speed + 8 * clamped);
      }

      if (!onPavement && Math.abs(s.speed) > 0.3) {
        s.speed *= Math.pow(0.5, clamped);
      }

      const steerAmt = (keys.current.l ? 1 : 0) - (keys.current.r ? 1 : 0);
      if (Math.abs(s.speed) > 0.35 && steerAmt !== 0) {
        s.yaw += steerAmt * d.steer * (Math.abs(s.speed) / d.maxSpeed) * clamped;
        if (Math.abs(s.yaw - s.yawAtReset) > 0.3) s.steered = true;
      }

      let nx = s.x + Math.sin(s.yaw) * s.speed * clamped;
      let nz = s.z + Math.cos(s.yaw) * s.speed * clamped;

      // Soft magnet into delivery ring
      if (nextPt && nearPad) {
        const dx = nextPt.x - nx;
        const dz = nextPt.z - nz;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist < d.arriveR + 5) {
          nx += (dx / dist) * 10 * clamped;
          nz += (dz / dist) * 10 * clamped;
        }
      }

      const resolved = resolveBlockers(nx, nz, blockersRef.current, tankHardRef.current);
      if (resolved.hit) s.speed *= 0.25;
      s.x = THREE.MathUtils.clamp(resolved.x, -270, 270);
      s.z = THREE.MathUtils.clamp(resolved.z, -270, 270);

      if (next && nextPt && Math.hypot(s.x - nextPt.x, s.z - nextPt.z) < d.arriveR) {
        s.hits.add(next.id);
        onPadHits([...s.hits]);
        if (stopsRef.current.every((st) => s.hits.has(st.id))) {
          s.arrived = true;
          s.speed = 0;
          onArrive();
        }
      }
    } else {
      s.speed = 0;
    }

    // Rock-steady chassis — fixed Y, no pitch noise
    group.current.position.set(s.x, 0, s.z);
    group.current.rotation.set(0, s.yaw, 0);
    poseRef.current = { x: s.x, z: s.z, yaw: s.yaw };

    camTarget.current.set(s.x - Math.sin(s.yaw) * 16, 8.5, s.z - Math.cos(s.yaw) * 16);
    camera.position.lerp(camTarget.current, 1 - Math.pow(0.0015, clamped));
    lookAt.current.set(s.x, 2.0, s.z);
    camera.lookAt(lookAt.current);

    telemAcc.current += clamped;
    if (telemAcc.current >= 0.1) {
      telemAcc.current = 0;
      const bearing = nextPt ? Math.atan2(nextPt.x - s.x, nextPt.z - s.z) : s.yaw;
      onTelemetry({
        speed: Math.abs(s.speed),
        dist: nextPt ? Math.hypot(s.x - nextPt.x, s.z - nextPt.z) : 0,
        heading: s.yaw,
        bearing,
        aligned: Math.abs(normAngle(bearing - s.yaw)) < 0.4,
        x: s.x,
        z: s.z,
        steered: s.steered,
        onRoad: onPavement,
        padHits: [...s.hits],
      });
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, 1.35, 0.9]}>
        <boxGeometry args={[2.2, 1.5, 2.2]} />
        <meshStandardMaterial color="#7ad4e4" emissive="#2a6070" emissiveIntensity={0.5} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.45, -2.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 4.6, 14]} />
        <meshStandardMaterial color="#2c3a44" metalness={0.55} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.55, -0.6]}>
        <boxGeometry args={[2.0, 0.35, 6.2]} />
        <meshStandardMaterial color="#121a20" metalness={0.4} roughness={0.6} />
      </mesh>
      {[
        [1.05, 0.45, 1.4], [-1.05, 0.45, 1.4],
        [1.05, 0.45, -1.2], [-1.05, 0.45, -1.2],
        [1.05, 0.45, -3.4], [-1.05, 0.45, -3.4],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.45, 0.45, 0.35, 10]} />
          <meshStandardMaterial color="#0a0e12" roughness={0.9} />
        </mesh>
      ))}
      <spotLight position={[0, 1.4, 2.2]} angle={0.45} penumbra={0.5} intensity={20} distance={42} color="#dff6ff" />
    </group>
  );
}

function WorldInner(props: SceneProps) {
  const yard = props.points.find((p) => p.kind === 'yard');
  const tanks = props.points.filter((p) => p.kind === 'tank');
  const poseRef = useRef<{ x: number; z: number; yaw: number } | null>(null);
  const [hitIds, setHitIds] = useState<string[]>([]);

  const natureProps: NatureProp[] = useMemo(
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
      <ambientLight intensity={0.78} />
      <directionalLight position={[50, 70, 25]} intensity={1.05} color="#e8f0f8" />
      <hemisphereLight args={['#7a9ab0', '#3a3428', 0.7]} />
      <Stars radius={280} depth={80} count={700} factor={2.5} saturation={0.1} fade speed={0.2} />
      <Moon />

      <DriveWorld roads={props.roads} points={props.points} natureProps={natureProps} />
      <PlantRoads
        ribbons={props.ribbons}
        points={props.points}
        targetId={nextStop?.facilityId ?? null}
      />

      {yard && <Yard point={yard} />}
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
      camera={{ position: [0, 14, 22], fov: 55, near: 0.1, far: 560 }}
      dpr={[1, 1.25]}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
    >
      <WorldInner {...props} />
    </Canvas>
  );
}
