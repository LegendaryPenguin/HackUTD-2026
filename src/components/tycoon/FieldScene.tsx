import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, SoftShadows } from '@react-three/drei';
import { BackSide, CanvasTexture, Color, MathUtils, RepeatWrapping, Vector3 } from 'three';
import type { Group, Mesh } from 'three';
import type { Coin, FloatText, Pad } from '../../lib/tycoon';
import { DRILL_COST, TANK_POS, fmtCash, upgradeCost } from '../../lib/tycoon';
import { FieldWorker } from './FieldWorker';
import {
  type MotorKeys,
  type MotorState,
  stepIsoCamera,
  stepMotor,
} from './PlayerMotor';

export type Prompt =
  | { kind: 'idle' }
  | { kind: 'buy'; padId: string; label: string; cost: number; canAfford: boolean; progress: number }
  | { kind: 'upgrade'; padId: string; label: string; cost: number; canAfford: boolean; progress: number }
  | { kind: 'max'; padId: string };

type Props = {
  pads: Pad[];
  coins: Coin[];
  floats: FloatText[];
  cash: number;
  waterFill: number;
  shutIn: boolean;
  pipeLevel: number;
  trucksOwned: number;
  trucksBusy: number;
  /** Pad ids currently in a night-shift crisis */
  crisisPadIds: string[];
  crisisTankPct: number;
  onBuyPad: (id: string) => void;
  onUpgradePad: (id: string) => void;
  onPickup: (x: number, z: number, dt: number) => void;
  onPrompt: (p: Prompt) => void;
};

const BOUNDS = 13.5;
const INTERACT_R = 2.35;
const HOLD_SEC = 0.4;

function makeSandTextures() {
  const size = 128;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);
  for (let i = 0; i < aImg.data.length; i += 4) {
    const j = Math.random() * 18 - 9;
    aImg.data[i] = Math.max(0, Math.min(255, 236 + j));
    aImg.data[i + 1] = Math.max(0, Math.min(255, 198 + j));
    aImg.data[i + 2] = Math.max(0, Math.min(255, 148 + j));
    aImg.data[i + 3] = 255;
  }
  aCtx.putImageData(aImg, 0, 0);
  const albedo = new CanvasTexture(albedoCanvas);
  albedo.wrapS = albedo.wrapT = RepeatWrapping;
  albedo.repeat.set(14, 14);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  const bImg = bCtx.createImageData(size, size);
  for (let i = 0; i < bImg.data.length; i += 4) {
    const v = 90 + Math.random() * 100;
    bImg.data[i] = bImg.data[i + 1] = bImg.data[i + 2] = v;
    bImg.data[i + 3] = 255;
  }
  bCtx.putImageData(bImg, 0, 0);
  const bump = new CanvasTexture(bumpCanvas);
  bump.wrapS = bump.wrapT = RepeatWrapping;
  bump.repeat.set(20, 20);
  return { albedo, bump };
}

function ParadiseSky() {
  const mat = useMemo(
    () => ({
      uniforms: {
        uHorizon: { value: new Color('#ff8a45') },
        uMid: { value: new Color('#e8a8d0') },
        uZenith: { value: new Color('#4ba8f8') },
      },
      vertexShader: `varying vec3 vWorldDir; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vWorldDir=normalize(wp.xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uZenith; varying vec3 vWorldDir; void main(){ float h=normalize(vWorldDir).y; vec3 col=mix(uHorizon,uMid,smoothstep(-0.05,0.18,h)); col=mix(col,uZenith,smoothstep(0.12,0.58,h)); gl_FragColor=vec4(col,1.0); }`,
    }),
    [],
  );
  return (
    <mesh renderOrder={-999} frustumCulled={false}>
      <sphereGeometry args={[120, 32, 24]} />
      <shaderMaterial args={[mat]} side={BackSide} depthWrite={false} />
    </mesh>
  );
}

function Ground() {
  const { albedo, bump } = useMemo(() => makeSandTextures(), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[42, 64]} />
        <meshStandardMaterial map={albedo} bumpMap={bump} bumpScale={0.08} roughness={0.94} color="#f0d4a5" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[15.2, 16.2, 64]} />
        <meshStandardMaterial color="#3fc3cc" roughness={0.55} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Palm({ x, z, lean = 0.1, h = 4.2 }: { x: number; z: number; lean?: number; h?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, lean * 3, lean]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.28, h, 8]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.cos((i / 5) * Math.PI * 2) * 0.3, h - 0.1, Math.sin((i / 5) * Math.PI * 2) * 0.3]}
          rotation={[0.7, (i / 5) * Math.PI * 2, 0]}
          castShadow
        >
          <boxGeometry args={[0.15, 1.5, 0.55]} />
          <meshStandardMaterial color="#2f9e5d" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function SoftPumpjack({ level, active }: { level: number; active: boolean }) {
  const head = useRef<Group>(null);
  const counter = useRef<Mesh>(null);
  const spark = useRef<Group>(null);
  const rod = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (1.35 + level * 0.32);
    const swing = active ? Math.sin(t) * 0.55 : -0.18;
    if (head.current) head.current.rotation.z = swing;
    if (counter.current) counter.current.rotation.z = -swing * 0.9;
    if (rod.current) {
      rod.current.position.y = 0.55 + (active ? (Math.sin(t) * 0.5 + 0.5) * 0.55 : 0.15);
    }
    if (spark.current) {
      spark.current.visible = active;
      spark.current.rotation.y = clock.elapsedTime * 2.2;
      const s = 0.85 + Math.sin(clock.elapsedTime * 6) * 0.15;
      spark.current.scale.setScalar(s);
    }
  });
  const accents = ['#ff8b6b', '#3fc3cc', '#f5c542', '#a855f7', '#5fb56b'];
  const accent = accents[Math.min(level, accents.length) - 1] ?? '#ff8b6b';
  return (
    <group>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <cylinderGeometry args={[0.95, 1.05, 0.18, 20]} />
        <meshStandardMaterial color="#9aa7b0" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.55, 0.5, 1.05]} />
        <meshStandardMaterial color="#5f6e78" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0.15, 1.45, 0]} castShadow>
        <capsuleGeometry args={[0.15, 1.55, 4, 10]} />
        <meshStandardMaterial color="#d7dee3" metalness={0.3} roughness={0.32} />
      </mesh>
      <group ref={head} position={[0.15, 2.28, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.11, 2.05, 4, 8]} />
          <meshStandardMaterial color={accent} roughness={0.38} metalness={0.2} />
        </mesh>
        <mesh position={[-1.2, -0.3, 0]} castShadow>
          <boxGeometry args={[0.42, 0.62, 0.22]} />
          <meshStandardMaterial color="#f4f7f8" />
        </mesh>
        <mesh ref={counter} position={[1.05, 0.12, 0]} castShadow>
          <boxGeometry args={[0.55, 0.55, 0.38]} />
          <meshStandardMaterial color="#2f3942" metalness={0.35} roughness={0.4} />
        </mesh>
      </group>
      <mesh ref={rod} position={[-1.05, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />
        <meshStandardMaterial color="#f5c542" metalness={0.45} roughness={0.28} />
      </mesh>
      <group ref={spark} position={[0, 2.85, 0]}>
        <mesh>
          <sphereGeometry args={[0.18, 10, 10]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} transparent opacity={0.85} />
        </mesh>
      </group>
      {active && (
        <pointLight position={[0, 2.4, 0]} color={accent} intensity={0.35 + level * 0.08} distance={3.5} />
      )}
    </group>
  );
}

function PipeSegment({
  from,
  to,
  growRef,
  flowing,
}: {
  from: [number, number, number];
  to: [number, number, number];
  growRef: { current: number };
  flowing: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  const pulse = useRef<Mesh>(null);
  const yAxis = useMemo(() => new Vector3(0, 1, 0), []);
  const dir = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const p = MathUtils.clamp(growRef.current, 0, 1);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const full = Math.hypot(dx, dy, dz) || 1;
    if (mesh.current) {
      mesh.current.visible = p > 0.04;
      const len = Math.max(0.08, full * p);
      mesh.current.scale.set(1, len, 1);
      mesh.current.position.set(from[0] + (dx * p) / 2, from[1] + (dy * p) / 2 + 0.22, from[2] + (dz * p) / 2);
      dir.set(dx, dy, dz).normalize();
      mesh.current.quaternion.setFromUnitVectors(yAxis, dir);
    }
    if (pulse.current) {
      const on = flowing && p > 0.92;
      pulse.current.visible = on;
      if (on) {
        const u = (clock.elapsedTime * 0.55 + from[0] * 0.01) % 1;
        pulse.current.position.set(from[0] + dx * u, 0.38 + Math.sin(u * Math.PI) * 0.12, from[2] + dz * u);
      }
    }
  });

  return (
    <group>
      <mesh ref={mesh} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 1, 8]} />
        <meshStandardMaterial
          color={flowing ? '#f5c542' : '#b7c0c7'}
          emissive={flowing ? '#f5c542' : '#000000'}
          emissiveIntensity={flowing ? 0.28 : 0}
          metalness={0.45}
          roughness={0.35}
        />
      </mesh>
      <mesh ref={pulse} visible={false}>
        <sphereGeometry args={[0.11, 8, 8]} />
        <meshStandardMaterial color="#3fc3cc" emissive="#3fc3cc" emissiveIntensity={0.75} />
      </mesh>
    </group>
  );
}

function PipeNetwork({
  pads,
  pipeLevel,
  flowing,
}: {
  pads: Pad[];
  pipeLevel: number;
  flowing: boolean;
}) {
  const grow = useRef(pipeLevel > 0 ? 1 : 0);
  const manifold = useRef<Mesh>(null);
  useFrame((_, dt) => {
    grow.current = MathUtils.damp(grow.current, pipeLevel > 0 ? 1 : 0, 1.8, dt);
    if (manifold.current) {
      const p = grow.current;
      manifold.current.visible = p > 0.45;
      manifold.current.scale.setScalar(0.6 + p * 0.4);
    }
  });
  const wells = pads.filter((p) => p.level > 0);
  return (
    <group>
      {wells.map((p) => (
        <PipeSegment
          key={p.id}
          from={[p.x, 0.15, p.z]}
          to={[TANK_POS.x, 0.35, TANK_POS.z]}
          growRef={grow}
          flowing={flowing && pipeLevel > 0}
        />
      ))}
      <mesh ref={manifold} position={[TANK_POS.x + 1.4, 0.35, TANK_POS.z]} castShadow visible={false}>
        <boxGeometry args={[1.6, 0.25, 0.35]} />
        <meshStandardMaterial color="#d9a441" metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

function RingTruck({ index, total, busy }: { index: number; total: number; busy: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const base = (index / Math.max(1, total)) * Math.PI * 2;
    const speed = busy ? 0.55 : 0.22;
    const a = base + clock.elapsedTime * speed;
    const r = 15.7;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    ref.current.position.set(x, 0.2, z);
    ref.current.rotation.y = -a + Math.PI / 2;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.1, 0.45, 0.55]} />
        <meshStandardMaterial color={busy ? '#ff8b6b' : '#3fc3cc'} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[-0.45, 0.55, 0]} castShadow>
        <boxGeometry args={[0.35, 0.3, 0.5]} />
        <meshStandardMaterial color="#fff8ec" />
      </mesh>
      {[-0.35, 0.35].map((z, i) => (
        <mesh key={i} position={[0.25, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.14, 10]} />
          <meshStandardMaterial color="#2f3942" />
        </mesh>
      ))}
      {[-0.35, 0.35].map((z, i) => (
        <mesh key={`r${i}`} position={[-0.35, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.14, 10]} />
          <meshStandardMaterial color="#2f3942" />
        </mesh>
      ))}
    </group>
  );
}

function TruckFleet({ owned, busyCount }: { owned: number; busyCount: number }) {
  if (owned < 1) return null;
  return (
    <group>
      {Array.from({ length: owned }, (_, i) => (
        <RingTruck key={i} index={i} total={owned} busy={i < busyCount} />
      ))}
    </group>
  );
}

function CoinMesh({ coin }: { coin: Coin }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const age = Math.min(1, (performance.now() - coin.born) / 350);
    // Pop out of wellhead then settle
    const popY = Math.sin(age * Math.PI) * 0.9 * (1 - age * 0.3);
    ref.current.position.set(coin.x, 0.4 + popY + Math.sin(clock.elapsedTime * 5 + coin.id) * 0.1, coin.z);
    ref.current.rotation.y = clock.elapsedTime * 4 + coin.id;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 3 + coin.id) * 0.25;
    const s = 0.75 + age * 0.25;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.09, 22]} />
        <meshStandardMaterial color="#f5c542" emissive="#f5c542" emissiveIntensity={0.55} metalness={0.6} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.04, 16]} />
        <meshStandardMaterial color="#fff3a8" emissive="#ffe566" emissiveIntensity={0.4} />
      </mesh>
      <pointLight color="#ffe566" intensity={0.55} distance={2.4} />
    </group>
  );
}

function FloatBillboard({ f }: { f: FloatText }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = (performance.now() - f.born) / 900;
    ref.current.position.y = 1.4 + t * 1.6;
    ref.current.visible = t < 1;
  });
  return (
    <group ref={ref} position={[f.x, 1.4, f.z]}>
      <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="ty-world-pop">+{fmtCash(f.amount)}</div>
      </Html>
    </group>
  );
}

function PadSpot({
  pad,
  near,
  cash,
  active,
  progress,
  crisis,
  crisisTankPct,
}: {
  pad: Pad;
  near: boolean;
  cash: number;
  active: boolean;
  progress: number;
  crisis: boolean;
  crisisTankPct: number;
}) {
  const cost = pad.level === 0 ? DRILL_COST : pad.level < 5 ? upgradeCost(pad.level) : null;
  const can = cost != null && cash >= cost;
  const color = crisis
    ? '#ff5a5a'
    : pad.level === 0
      ? (can ? '#5fb56b' : '#f5c542')
      : can
        ? '#3fc3cc'
        : '#94a3b8';
  const ring = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = near || crisis ? 1.12 + Math.sin(clock.elapsedTime * (crisis ? 8 : 6)) * 0.07 : 1;
    ring.current.scale.set(s, 1, s);
  });

  return (
    <group position={[pad.x, 0, pad.z]}>
      <group ref={ring} position={[0, 0.06, 1.25]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.05, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={crisis ? 0.85 : near ? 0.7 : can ? 0.35 : 0.12}
            transparent
            opacity={0.92}
          />
        </mesh>
        {near && progress > 0 && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[1.1, 1.28, 48, 1, 0, Math.PI * 2 * progress]} />
            <meshBasicMaterial color="#fff8ec" />
          </mesh>
        )}
      </group>
      {(near || crisis) && (
        <Html center position={[0, 1.85, 1.25]} distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className={`ty-pad-tag ${crisis ? 'hot' : can ? 'go' : ''}`}>
            {crisis && <>Pump down. Tank {Math.round(crisisTankPct)}%</>}
            {!crisis && pad.level === 0 && <>Hold E. Drill {fmtCash(DRILL_COST)}</>}
            {!crisis && pad.level > 0 && pad.level < 5 && <>Hold E. Upgrade {fmtCash(cost!)}</>}
            {!crisis && pad.level >= 5 && <>Maxed</>}
          </div>
        </Html>
      )}
      {pad.level > 0 ? (
        <SoftPumpjack level={pad.level} active={active && !crisis} />
      ) : (
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.65, 0.35, 16]} />
          <meshStandardMaterial color="#c4b59a" roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function WaterTanks({ fill, critical }: { fill: number; critical: boolean }) {
  const h = 0.35 + fill * 1.45;
  const color = critical ? '#ff5a5a' : fill > 0.7 ? '#f5c542' : '#3fc3cc';
  return (
    <group position={[TANK_POS.x, 0, TANK_POS.z]}>
      {[-1.15, 1.15].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <cylinderGeometry args={[0.85, 0.9, 2.3, 20]} />
            <meshStandardMaterial color="#7a8790" metalness={0.2} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2 + h / 2, 0]}>
            <cylinderGeometry args={[0.7, 0.7, h, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.88} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Decor() {
  return (
    <group>
      <Palm x={-12} z={8} />
      <Palm x={-14} z={3} lean={-0.1} h={5} />
      <Palm x={12} z={9} lean={0.14} h={4.6} />
      <Palm x={14} z={-2} lean={-0.06} />
      <Palm x={-11} z={-9} lean={0.1} h={4.8} />
      <Palm x={10} z={-10} lean={-0.12} />
      {[
        [-6, 10], [3, 11], [11, 5], [-13, -4], [6, -12], [-3, -11],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.35, z]} castShadow scale={[1 + (i % 3) * 0.2, 0.7, 1]}>
          <sphereGeometry args={[0.9, 14, 12]} />
          <meshStandardMaterial color="#c9b089" roughness={1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 22]}>
        <circleGeometry args={[18, 48]} />
        <meshStandardMaterial color="#3fc3cc" transparent opacity={0.55} roughness={0.2} />
      </mesh>
      <group position={[7.5, 0, 7]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[2.4, 1.8, 2.4]} />
          <meshStandardMaterial color="#ff8b6b" roughness={0.55} />
        </mesh>
        <mesh position={[0, 2.05, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.9, 1.1, 4]} />
          <meshStandardMaterial color="#ffe566" />
        </mesh>
      </group>
    </group>
  );
}

function Dust({ active }: { active: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = active;
    if (!active) return;
    ref.current.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 3 + i * 0.4) % 1;
      c.position.set((i - 1.5) * 0.15, 0.05 + t * 0.35, 0.35 + t * 0.2);
      c.scale.setScalar(0.4 * (1 - t));
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.12, 6, 6]} />
          <meshStandardMaterial color="#e8d4b0" transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function PathRing({ x, z, alive }: { x: number; z: number; alive: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = alive;
    if (!alive) return;
    const s = 0.7 + Math.sin(clock.elapsedTime * 8) * 0.08;
    ref.current.scale.set(s, 1, s);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.04, z]}>
      <ringGeometry args={[0.35, 0.55, 28]} />
      <meshBasicMaterial color="#ffe566" transparent opacity={0.85} />
    </mesh>
  );
}

function PlayerController({
  pads,
  cash,
  onBuyPad,
  onUpgradePad,
  onPickup,
  onPrompt,
  onNearPad,
  onHoldProgress,
}: Pick<Props, 'pads' | 'cash' | 'onBuyPad' | 'onUpgradePad' | 'onPickup' | 'onPrompt'> & {
  onNearPad: (id: string | null) => void;
  onHoldProgress: (n: number) => void;
}) {
  const player = useRef<Group>(null);
  const keys = useRef<MotorKeys>({ f: false, b: false, l: false, r: false, sprint: false, e: false });
  const motor = useRef<MotorState>({ x: 0, z: 6, facing: Math.PI, moving: false, target: null });
  const [isMoving, setIsMoving] = useState(false);
  const [ring, setRing] = useState<{ x: number; z: number } | null>(null);
  const hold = useRef(0);
  const zoom = useRef(1);
  const { camera, gl } = useThree();
  const camPos = useRef(new Vector3(6.5, 11.2, 18.5));
  const camTarget = useRef(new Vector3(0, 0.55, 6));
  const promptRef = useRef<Prompt>({ kind: 'idle' });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.code;
      if (k === 'KeyW' || k === 'ArrowUp') keys.current.f = true;
      if (k === 'KeyS' || k === 'ArrowDown') keys.current.b = true;
      if (k === 'KeyA' || k === 'ArrowLeft') keys.current.l = true;
      if (k === 'KeyD' || k === 'ArrowRight') keys.current.r = true;
      if (k === 'ShiftLeft' || k === 'ShiftRight') keys.current.sprint = true;
      if (k === 'KeyE' || k === 'Space') keys.current.e = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = e.code;
      if (k === 'KeyW' || k === 'ArrowUp') keys.current.f = false;
      if (k === 'KeyS' || k === 'ArrowDown') keys.current.b = false;
      if (k === 'KeyA' || k === 'ArrowLeft') keys.current.l = false;
      if (k === 'KeyD' || k === 'ArrowRight') keys.current.r = false;
      if (k === 'ShiftLeft' || k === 'ShiftRight') keys.current.sprint = false;
      if (k === 'KeyE' || k === 'Space') keys.current.e = false;
    };
    const wheel = (e: WheelEvent) => {
      zoom.current = MathUtils.clamp(zoom.current + e.deltaY * 0.0012, 0.72, 1.45);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    gl.domElement.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      gl.domElement.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const g = player.current;
    if (!g) return;
    const step = Math.min(dt, 0.05);

    // GastroCity-style: wish * speed * dt (+ click-to-move)
    motor.current = stepMotor(motor.current, keys.current, step, BOUNDS);
    g.position.x = motor.current.x;
    g.position.z = motor.current.z;
    g.rotation.y = MathUtils.lerp(g.rotation.y, motor.current.facing, 1 - Math.exp(-14 * step));
    if (motor.current.moving !== isMoving) setIsMoving(motor.current.moving);
    if (!motor.current.target && ring) setRing(null);

    // Iso camera (GastroCity dampAlpha follow)
    stepIsoCamera(camPos.current, camTarget.current, motor.current.x, motor.current.z, zoom.current, step);
    camera.position.copy(camPos.current);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTarget.current);

    onPickup(motor.current.x, motor.current.z, step);

    let best: Prompt = { kind: 'idle' };
    let nearId: string | null = null;
    let bestD = INTERACT_R;
    for (const pad of pads) {
      const d = Math.hypot(motor.current.x - pad.x, motor.current.z - (pad.z + 1.25));
      if (d < bestD) {
        bestD = d;
        nearId = pad.id;
        if (pad.level === 0) {
          best = { kind: 'buy', padId: pad.id, label: 'Drill well', cost: DRILL_COST, canAfford: cash >= DRILL_COST, progress: 0 };
        } else if (pad.level >= 5) {
          best = { kind: 'max', padId: pad.id };
        } else {
          const cost = upgradeCost(pad.level);
          best = { kind: 'upgrade', padId: pad.id, label: `Upgrade L${pad.level}`, cost, canAfford: cash >= cost, progress: 0 };
        }
      }
    }

    if ((best.kind === 'buy' || best.kind === 'upgrade') && best.canAfford && keys.current.e) {
      hold.current = Math.min(HOLD_SEC, hold.current + step);
      best = { ...best, progress: hold.current / HOLD_SEC };
      if (hold.current >= HOLD_SEC) {
        if (best.kind === 'buy') onBuyPad(best.padId);
        else onUpgradePad(best.padId);
        hold.current = 0;
      }
    } else {
      hold.current = Math.max(0, hold.current - step * 2.5);
      if (best.kind === 'buy' || best.kind === 'upgrade') {
        best = { ...best, progress: hold.current / HOLD_SEC };
      }
    }
    onHoldProgress(hold.current / HOLD_SEC);

    if (JSON.stringify(promptRef.current) !== JSON.stringify(best)) {
      promptRef.current = best;
      onPrompt(best);
      onNearPad(nearId);
    }
  });

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onClick={(e) => {
          e.stopPropagation();
          let x = MathUtils.clamp(e.point.x, -BOUNDS, BOUNDS);
          let z = MathUtils.clamp(e.point.z, -BOUNDS, BOUNDS);
          // Snap to nearest pad ring if click is close (tycoon QoL)
          let best = 2.8;
          for (const pad of pads) {
            const px = pad.x;
            const pz = pad.z + 1.25;
            const d = Math.hypot(x - px, z - pz);
            if (d < best) {
              best = d;
              x = px;
              z = pz;
            }
          }
          motor.current = { ...motor.current, target: { x, z } };
          setRing({ x, z });
        }}
      >
        <circleGeometry args={[BOUNDS + 0.5, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ring && <PathRing x={ring.x} z={ring.z} alive />}
      <group ref={player} position={[0, 0, 6]} rotation={[0, Math.PI, 0]}>
        <FieldWorker moving={isMoving} />
        <Dust active={isMoving} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.6, 24]} />
          <meshBasicMaterial color="#3fc3cc" transparent opacity={0.4} />
        </mesh>
      </group>
    </>
  );
}

function SceneInner(props: Props) {
  const [nearPad, setNearPad] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  return (
    <>
      <ParadiseSky />
      <fog attach="fog" args={['#f2c9a0', 32, 75]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffe8d2', '#c9b089', 0.65]} />
      <directionalLight castShadow position={[8, 18, 10]} intensity={1.4} color="#ffe0b8" shadow-mapSize={[2048, 2048]} />
      <SoftShadows size={16} samples={8} focus={0.65} />
      <Ground />
      <Decor />
      <WaterTanks fill={props.waterFill} critical={props.shutIn || props.waterFill > 0.9} />
      <PipeNetwork pads={props.pads} pipeLevel={props.pipeLevel} flowing={!props.shutIn} />
      <TruckFleet owned={props.trucksOwned} busyCount={Math.ceil(props.trucksBusy)} />
      {props.coins.map((c) => (
        <CoinMesh key={c.id} coin={c} />
      ))}
      {props.floats.map((f) => (
        <FloatBillboard key={f.id} f={f} />
      ))}
      {props.pads.map((p) => (
        <PadSpot
          key={p.id}
          pad={p}
          near={nearPad === p.id}
          cash={props.cash}
          active={!props.shutIn}
          progress={nearPad === p.id ? holdProgress : 0}
          crisis={props.crisisPadIds.includes(p.id)}
          crisisTankPct={props.crisisTankPct}
        />
      ))}
      <PlayerController
        pads={props.pads}
        cash={props.cash}
        onBuyPad={props.onBuyPad}
        onUpgradePad={props.onUpgradePad}
        onPickup={props.onPickup}
        onPrompt={props.onPrompt}
        onNearPad={setNearPad}
        onHoldProgress={setHoldProgress}
      />
    </>
  );
}

export function FieldScene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [0, 12, 20], fov: 38, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
    >
      <SceneInner {...props} />
    </Canvas>
  );
}
