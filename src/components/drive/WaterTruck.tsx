/**
 * Water truck that reads from the chase camera: light cab, banded tank, lit tail.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';

const paint = { color: '#d5e2e8', metalness: 0.35, roughness: 0.42 };
const tank = { color: '#8ea3ab', metalness: 0.45, roughness: 0.38 };
const steel = { color: '#1a2228', metalness: 0.5, roughness: 0.55 };

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.48, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.48, 0.48, 0.34, 14]} />
        <meshStandardMaterial color="#14181c" roughness={0.92} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.12 : -0.12, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.08, 10]} />
        <meshStandardMaterial color="#8d97a0" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function WaterTruck({ speedRef }: { speedRef: React.MutableRefObject<number> }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!spin.current) return;
    const w = speedRef.current / 0.48;
    for (const child of spin.current.children) {
      child.rotation.x += w * Math.min(dt, 0.05);
    }
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, -0.4]}>
        <circleGeometry args={[1.7, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} />
      </mesh>

      <mesh position={[0, 0.78, -0.2]}>
        <boxGeometry args={[2.05, 0.38, 7.1]} />
        <meshStandardMaterial {...steel} />
      </mesh>

      <mesh position={[0, 1.15, 2.85]}>
        <boxGeometry args={[1.9, 0.55, 1.15]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, 1.85, 1.85]}>
        <boxGeometry args={[1.95, 1.35, 1.7]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, 1.95, 2.72]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[1.7, 0.72, 0.08]} />
        <meshStandardMaterial color="#16323a" metalness={0.2} roughness={0.15} emissive="#0c242c" emissiveIntensity={0.3} />
      </mesh>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 1.05, 3.4]}>
          <boxGeometry args={[0.34, 0.16, 0.08]} />
          <meshStandardMaterial color="#f4fbff" emissive="#d7f2ff" emissiveIntensity={1.1} />
        </mesh>
      ))}

      <mesh position={[0, 1.72, -1.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.12, 1.12, 3.7, 20]} />
        <meshStandardMaterial {...tank} />
      </mesh>
      {[-2.15, -1.05, 0.05].map((z) => (
        <mesh key={z} position={[0, 1.72, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.18, 1.18, 0.12, 20]} />
          <meshStandardMaterial color="#c6a15a" metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 2.55, -1.05]}>
        <boxGeometry args={[0.35, 0.16, 2.4]} />
        <meshStandardMaterial color="#6e8d96" metalness={0.4} roughness={0.4} />
      </mesh>

      <mesh position={[0, 0.7, -3.05]}>
        <boxGeometry args={[2.15, 0.42, 0.28]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.95, -3.18]}>
          <boxGeometry args={[0.32, 0.16, 0.06]} />
          <meshStandardMaterial color="#ff5a4a" emissive="#ff2a22" emissiveIntensity={0.9} />
        </mesh>
      ))}

      <group ref={spin}>
        <Wheel x={1.15} z={2.15} />
        <Wheel x={-1.15} z={2.15} />
        <Wheel x={1.15} z={-0.55} />
        <Wheel x={-1.15} z={-0.55} />
        <Wheel x={1.15} z={-2.15} />
        <Wheel x={-1.15} z={-2.15} />
      </group>

      <spotLight position={[0, 1.3, 3.3]} angle={0.5} penumbra={0.55} intensity={18} distance={36} color="#e7f7ff" />
    </group>
  );
}
