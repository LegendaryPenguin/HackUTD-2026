/**
 * Cute field worker — art style adapted from HackKU26 DebtRunner BeachCharacter:
 * chibi proportions, soft tropical palette, bouncy run cycle.
 */
import { forwardRef, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

type Props = {
  moving: boolean;
};

export const FieldWorker = forwardRef<Group, Props>(function FieldWorker({ moving }, ref) {
  const body = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const cadence = moving ? 11 : 2.2;
    const swing = moving ? 0.55 : 0.06;
    const bob = moving ? Math.sin(t * cadence) * 0.07 : Math.sin(t * 2) * 0.015;
    const squash = moving ? 1 + Math.sin(t * cadence * 2) * 0.045 : 1;

    if (body.current) {
      body.current.position.y = bob;
      body.current.scale.set(1 / squash, squash, 1 / squash);
    }
    if (armL.current) armL.current.rotation.x = Math.sin(t * cadence) * swing;
    if (armR.current) armR.current.rotation.x = -Math.sin(t * cadence) * swing;
    if (legL.current) legL.current.rotation.x = -Math.sin(t * cadence) * swing * 1.15;
    if (legR.current) legR.current.rotation.x = Math.sin(t * cadence) * swing * 1.15;
  });

  const skin = '#ffd9b3';
  const shirt = '#ff8b6b';
  const pants = '#3fc3cc';
  const hair = '#3a2418';
  const hat = '#f5c542';

  return (
    <group ref={ref} position={[0, 0.72, 0]}>
      <group ref={body}>
        <mesh castShadow position={[0, 0.05, 0]}>
          <capsuleGeometry args={[0.32, 0.45, 6, 14]} />
          <meshStandardMaterial color={shirt} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.32, 0.34, 0.22, 16]} />
          <meshStandardMaterial color={pants} roughness={0.65} />
        </mesh>

        <group position={[0, 0.7, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.32, 20, 20]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.18, -0.02]} rotation={[-0.2, 0, 0]}>
            <sphereGeometry args={[0.33, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={hair} roughness={0.85} />
          </mesh>
          {/* hard hat */}
          <mesh position={[0, 0.28, 0]} castShadow>
            <sphereGeometry args={[0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={hat} roughness={0.4} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.22, 0.05]}>
            <cylinderGeometry args={[0.38, 0.4, 0.06, 20]} />
            <meshStandardMaterial color={hat} roughness={0.4} />
          </mesh>
          <mesh position={[-0.1, 0.02, 0.28]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#1d1d1d" />
          </mesh>
          <mesh position={[0.1, 0.02, 0.28]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#1d1d1d" />
          </mesh>
          <mesh position={[-0.18, -0.05, 0.25]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ff8b8b" transparent opacity={0.55} />
          </mesh>
          <mesh position={[0.18, -0.05, 0.25]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#ff8b8b" transparent opacity={0.55} />
          </mesh>
        </group>

        <group ref={armL} position={[-0.36, 0.18, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.22, 4, 8]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={armR} position={[0.36, 0.18, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.22, 4, 8]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={legL} position={[-0.14, -0.45, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.25, 4, 8]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={legR} position={[0.14, -0.45, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.25, 4, 8]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
      </group>
    </group>
  );
});
