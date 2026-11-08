import { useMemo } from 'react';
import * as THREE from 'three';
import { distToRoads, type DrivePoint, type DriveRoad } from '../../lib/driveMap';
import { ROAD_HALF_WIDTH } from '../../lib/driveRoads';

function seeded(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeDirtTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5a4a38';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 50},${55 + Math.random() * 40},${35 + Math.random() * 25},${0.12 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function SkyDome() {
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#0a1524');
    g.addColorStop(0.55, '#152a3c');
    g.addColorStop(0.82, '#2a3840');
    g.addColorStop(1, '#3d4a40');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false });
  }, []);
  return (
    <mesh material={mat} frustumCulled={false}>
      <sphereGeometry args={[360, 16, 10]} />
    </mesh>
  );
}

export type NatureProp = { kind: 'rock' | 'bush' | 'tree' | 'mesa'; x: number; z: number; s: number; ry: number };
export type NatureBlocker = { x: number; z: number; r: number };

export function buildNatureProps(roads: DriveRoad[], points: DrivePoint[]): NatureProp[] {
  const out: NatureProp[] = [];
  const sample = roads.filter((_, i) => i % 4 === 0);
  const clear = ROAD_HALF_WIDTH + 4;
  const blocked = (x: number, z: number, min: number) =>
    distToRoads(x, z, sample) < min
    || points.some((p) => Math.hypot(p.x - x, p.z - z) < (p.kind === 'tank' ? 18 : 12));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + seeded(i) * 0.15;
    const r = 200 + seeded(i + 2) * 40;
    out.push({ kind: 'mesa', x: Math.cos(a) * r, z: Math.sin(a) * r, s: 1.1, ry: a });
  }

  for (let i = 0; i < 26; i++) {
    const a = seeded(i * 11) * Math.PI * 2;
    const r = 28 + seeded(i * 13) * 140;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (blocked(x, z, clear)) continue;
    const roll = seeded(i + 8);
    out.push({
      kind: roll > 0.75 ? 'tree' : roll > 0.45 ? 'bush' : 'rock',
      x, z,
      s: 0.8 + seeded(i + 9) * 1.0,
      ry: seeded(i + 10) * Math.PI * 2,
    });
  }
  return out;
}

export function natureBlockersFromProps(props: NatureProp[]): NatureBlocker[] {
  return props
    .filter((p) => p.kind === 'bush' || p.kind === 'rock' || p.kind === 'tree')
    .map((p) => ({
      x: p.x,
      z: p.z,
      r: p.kind === 'tree' ? 1.8 * p.s : p.kind === 'rock' ? 1.3 * p.s : 1.55 * p.s,
    }));
}

function Rock({ s }: { s: number }) {
  return (
    <mesh scale={s} position={[0, 0.35 * s, 0]}>
      <dodecahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial color="#6a6558" roughness={0.95} flatShading />
    </mesh>
  );
}

function Bush({ s }: { s: number }) {
  return (
    <mesh scale={s} position={[0, 0.45, 0]}>
      <sphereGeometry args={[0.7, 6, 5]} />
      <meshStandardMaterial color="#3a5a40" roughness={0.9} flatShading />
    </mesh>
  );
}

function Tree({ s }: { s: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 5]} />
        <meshStandardMaterial color="#4a3a2a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <coneGeometry args={[0.85, 1.8, 6]} />
        <meshStandardMaterial color="#2f5a3a" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function Mesa({ s }: { s: number }) {
  const h = 11 * s;
  const w = 22 * s;
  return (
    <mesh position={[0, h * 0.35, 0]}>
      <boxGeometry args={[w, h * 0.7, w * 0.55]} />
      <meshStandardMaterial color="#6a5a48" roughness={0.95} flatShading />
    </mesh>
  );
}

/** Packed-earth lease world — roads stay readable (no green apron). */
export function DriveWorld({
  roads,
  points,
  natureProps,
}: {
  roads: DriveRoad[];
  points: DrivePoint[];
  natureProps?: NatureProp[];
}) {
  const tex = useMemo(() => makeDirtTexture(), []);
  const props = useMemo(
    () => natureProps ?? buildNatureProps(roads, points),
    [natureProps, roads, points],
  );

  return (
    <group>
      <SkyDome />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <circleGeometry args={[220, 40]} />
        <meshStandardMaterial map={tex} color="#8a7a62" roughness={0.96} metalness={0.02} />
      </mesh>
      {props.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.ry, 0]}>
          {p.kind === 'rock' && <Rock s={p.s} />}
          {p.kind === 'bush' && <Bush s={p.s} />}
          {p.kind === 'tree' && <Tree s={p.s} />}
          {p.kind === 'mesa' && <Mesa s={p.s} />}
        </group>
      ))}
    </group>
  );
}
