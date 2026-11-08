import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, SoftShadows } from '@react-three/drei';
import { BackSide, CanvasTexture, Color, MathUtils, RepeatWrapping, Vector3 } from 'three';
import type { Group } from 'three';
import type { Coin, Pad } from '../../lib/tycoon';
import { DRILL_COST, fmtCash, upgradeCost } from '../../lib/tycoon';
import { FieldWorker } from './FieldWorker';

export type Prompt =
  | { kind: 'idle' }
  | { kind: 'buy'; padId: string; label: string; cost: number; canAfford: boolean }
  | { kind: 'upgrade'; padId: string; label: string; cost: number; canAfford: boolean }
  | { kind: 'max'; padId: string };

type Props = {
  pads: Pad[];
  coins: Coin[];
  cash: number;
  waterFill: number;
  shutIn: boolean;
  onBuyPad: (id: string) => void;
  onUpgradePad: (id: string) => void;
  onPickup: (x: number, z: number) => void;
  onPrompt: (p: Prompt) => void;
};

const BOUNDS = 14;
const SPEED = 8;
const INTERACT_R = 2.2;
/** Fixed chase offset — never rotates with the player (stops sky-flip). */
const CAM_OFF = new Vector3(9, 11.5, 11);

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
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uZenith;
        varying vec3 vWorldDir;
        void main() {
          float h = normalize(vWorldDir).y;
          vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.18, h));
          col = mix(col, uZenith, smoothstep(0.12, 0.58, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
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
  useFrame(({ clock }) => {
    if (!head.current) return;
    head.current.rotation.z = active
      ? Math.sin(clock.elapsedTime * (1.25 + level * 0.3)) * 0.48
      : -0.2;
  });
  const accents = ['#ff8b6b', '#3fc3cc', '#f5c542', '#a855f7', '#5fb56b'];
  const accent = accents[Math.min(level, accents.length) - 1] ?? '#ff8b6b';
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1]} />
        <meshStandardMaterial color="#6b7c86" roughness={0.55} />
      </mesh>
      <mesh position={[0.15, 1.45, 0]} castShadow>
        <capsuleGeometry args={[0.14, 1.5, 4, 10]} />
        <meshStandardMaterial color="#d7dee3" metalness={0.25} roughness={0.35} />
      </mesh>
      <group ref={head} position={[0.15, 2.25, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.1, 1.9, 4, 8]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>
        <mesh position={[-1.15, -0.28, 0]} castShadow>
          <boxGeometry args={[0.4, 0.6, 0.2]} />
          <meshStandardMaterial color="#f4f7f8" />
        </mesh>
        <mesh position={[1.0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.35]} />
          <meshStandardMaterial color="#3a4550" />
        </mesh>
      </group>
      <mesh position={[-1.0, 1.05, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.9, 8]} />
        <meshStandardMaterial color="#f5c542" metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

function CoinMesh({ coin }: { coin: Coin }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const age = (performance.now() - coin.born) / 1000;
    ref.current.position.y = 0.45 + Math.sin(clock.elapsedTime * 4 + coin.id) * 0.12 + Math.min(age, 0.35) * 0.2;
    ref.current.rotation.y = clock.elapsedTime * 3 + coin.id;
  });
  return (
    <group ref={ref} position={[coin.x, 0.45, coin.z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 20]} />
        <meshStandardMaterial color="#f5c542" emissive="#f5c542" emissiveIntensity={0.45} metalness={0.55} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} />
        <meshStandardMaterial color="#ffe566" emissive="#ffe566" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function PadSpot({
  pad,
  near,
  cash,
  active,
}: {
  pad: Pad;
  near: boolean;
  cash: number;
  active: boolean;
}) {
  const cost = pad.level === 0 ? DRILL_COST : pad.level < 5 ? upgradeCost(pad.level) : null;
  const can = cost != null && cash >= cost;
  const color = pad.level === 0 ? (can ? '#5fb56b' : '#f5c542') : can ? '#3fc3cc' : '#94a3b8';
  const ring = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = near ? 1.08 + Math.sin(clock.elapsedTime * 5) * 0.05 : 1;
    ring.current.scale.set(s, 1, s);
  });

  return (
    <group position={[pad.x, 0, pad.z]}>
      <group ref={ring} position={[0, 0.06, 1.35]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 28]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={near ? 0.6 : can ? 0.3 : 0.1}
            transparent
            opacity={0.92}
          />
        </mesh>
      </group>
      {near && (
        <Html center position={[0, 1.7, 1.35]} distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="ty-pad-tag">
            {pad.level === 0 && <>E · Drill {fmtCash(DRILL_COST)}</>}
            {pad.level > 0 && pad.level < 5 && <>E · Upgrade L{pad.level} · {fmtCash(cost!)}</>}
            {pad.level >= 5 && <>Max cutie well 💕</>}
          </div>
        </Html>
      )}
      {pad.level > 0 ? (
        <SoftPumpjack level={pad.level} active={active} />
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
    <group position={[-8.5, 0, -4.5]}>
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
      {/* cute shop hut */}
      <group position={[8.5, 0, 6]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[2.4, 1.8, 2.4]} />
          <meshStandardMaterial color="#ff8b6b" roughness={0.55} />
        </mesh>
        <mesh position={[0, 2.05, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.9, 1.1, 4]} />
          <meshStandardMaterial color="#ffe566" />
        </mesh>
        <Html center position={[0, 2.9, 0]} distanceFactor={12} style={{ pointerEvents: 'none' }}>
          <div className="ty-pad-tag">Shop hut</div>
        </Html>
      </group>
    </group>
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
}: Omit<Props, 'coins' | 'waterFill' | 'shutIn'> & { onNearPad: (id: string | null) => void }) {
  const player = useRef<Group>(null);
  const keys = useRef({ f: false, b: false, l: false, r: false, e: false });
  const moving = useRef(false);
  const [isMoving, setIsMoving] = useState(false);
  const interactLock = useRef(false);
  const pickupAcc = useRef(0);
  const { camera } = useThree();
  const camPos = useRef(new Vector3(9, 11.5, 19));
  const facing = useRef(Math.PI); // face into the field (-Z) at start
  const promptRef = useRef<Prompt>({ kind: 'idle' });

  // Screen axes from fixed camera (never depend on player facing)
  const screenFwd = useMemo(() => {
    const f = new Vector3(-CAM_OFF.x, 0, -CAM_OFF.z).normalize();
    return f;
  }, []);
  const screenRight = useMemo(() => new Vector3().crossVectors(screenFwd, new Vector3(0, 1, 0)).normalize(), [screenFwd]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keys.current.f = true;
      if (k === 's' || k === 'arrowdown') keys.current.b = true;
      if (k === 'a' || k === 'arrowleft') keys.current.l = true;
      if (k === 'd' || k === 'arrowright') keys.current.r = true;
      if (k === 'e' || k === ' ') keys.current.e = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keys.current.f = false;
      if (k === 's' || k === 'arrowdown') keys.current.b = false;
      if (k === 'a' || k === 'arrowleft') keys.current.l = false;
      if (k === 'd' || k === 'arrowright') keys.current.r = false;
      if (k === 'e' || k === ' ') keys.current.e = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, dt) => {
    const g = player.current;
    if (!g) return;
    const step = Math.min(dt, 0.05);

    let wishX = 0;
    let wishZ = 0;
    if (keys.current.f) { wishX += screenFwd.x; wishZ += screenFwd.z; }
    if (keys.current.b) { wishX -= screenFwd.x; wishZ -= screenFwd.z; }
    if (keys.current.r) { wishX += screenRight.x; wishZ += screenRight.z; }
    if (keys.current.l) { wishX -= screenRight.x; wishZ -= screenRight.z; }

    const len = Math.hypot(wishX, wishZ);
    const nowMoving = len > 0;
    if (nowMoving !== moving.current) {
      moving.current = nowMoving;
      setIsMoving(nowMoving);
    }
    if (nowMoving) {
      wishX /= len;
      wishZ /= len;
      g.position.x = MathUtils.clamp(g.position.x + wishX * SPEED * step, -BOUNDS, BOUNDS);
      g.position.z = MathUtils.clamp(g.position.z + wishZ * SPEED * step, -BOUNDS, BOUNDS);
      facing.current = Math.atan2(wishX, wishZ);
      g.rotation.y = MathUtils.lerp(g.rotation.y, facing.current, 1 - Math.pow(0.0008, step));
    }

    // Soft chase with FIXED offset — height never flips
    const desired = new Vector3(g.position.x + CAM_OFF.x, CAM_OFF.y, g.position.z + CAM_OFF.z);
    camPos.current.lerp(desired, 1 - Math.pow(0.04, step));
    camera.position.copy(camPos.current);
    camera.up.set(0, 1, 0);
    camera.lookAt(g.position.x, 1.0, g.position.z);

    // Coin vacuum
    pickupAcc.current += step;
    if (pickupAcc.current > 0.05) {
      pickupAcc.current = 0;
      onPickup(g.position.x, g.position.z);
    }

    let best: Prompt = { kind: 'idle' };
    let nearId: string | null = null;
    let bestD = INTERACT_R;
    for (const pad of pads) {
      const d = Math.hypot(g.position.x - pad.x, g.position.z - (pad.z + 1.35));
      if (d < bestD) {
        bestD = d;
        nearId = pad.id;
        if (pad.level === 0) {
          best = { kind: 'buy', padId: pad.id, label: 'Drill well', cost: DRILL_COST, canAfford: cash >= DRILL_COST };
        } else if (pad.level >= 5) {
          best = { kind: 'max', padId: pad.id };
        } else {
          const cost = upgradeCost(pad.level);
          best = { kind: 'upgrade', padId: pad.id, label: `Upgrade L${pad.level}`, cost, canAfford: cash >= cost };
        }
      }
    }

    if (JSON.stringify(promptRef.current) !== JSON.stringify(best)) {
      promptRef.current = best;
      onPrompt(best);
      onNearPad(nearId);
    }

    if (keys.current.e && !interactLock.current) {
      interactLock.current = true;
      if (best.kind === 'buy' && best.canAfford) onBuyPad(best.padId);
      else if (best.kind === 'upgrade' && best.canAfford) onUpgradePad(best.padId);
    }
    if (!keys.current.e) interactLock.current = false;
  });

  return (
    <group ref={player} position={[0, 0, 7]} rotation={[0, Math.PI, 0]}>
      <FieldWorker moving={isMoving} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#3fc3cc" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function SceneInner(props: Props) {
  const [nearPad, setNearPad] = useState<string | null>(null);

  return (
    <>
      <ParadiseSky />
      <fog attach="fog" args={['#f2c9a0', 30, 72]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffe8d2', '#c9b089', 0.65]} />
      <directionalLight
        castShadow
        position={[12, 18, 8]}
        intensity={1.35}
        color="#ffe0b8"
        shadow-mapSize={[2048, 2048]}
      />
      <SoftShadows size={18} samples={8} focus={0.7} />
      <Ground />
      <Decor />
      <WaterTanks fill={props.waterFill} critical={props.shutIn || props.waterFill > 0.9} />
      {props.coins.map((c) => (
        <CoinMesh key={c.id} coin={c} />
      ))}
      {props.pads.map((p) => (
        <PadSpot key={p.id} pad={p} near={nearPad === p.id} cash={props.cash} active={!props.shutIn} />
      ))}
      <PlayerController
        pads={props.pads}
        cash={props.cash}
        onBuyPad={props.onBuyPad}
        onUpgradePad={props.onUpgradePad}
        onPickup={props.onPickup}
        onPrompt={props.onPrompt}
        onNearPad={setNearPad}
      />
    </>
  );
}

export function FieldScene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [9, 11.5, 18], fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
    >
      <SceneInner {...props} />
    </Canvas>
  );
}
