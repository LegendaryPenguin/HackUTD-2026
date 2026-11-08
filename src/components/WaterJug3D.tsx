import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { useReducedMotion } from 'framer-motion';
import './water-jug-3d.css';

/**
 * WebGL water jug. Glass is a lathed vessel; GSAP tweens the water column
 * to the live tank percent (same contract as the old SVG gauge).
 */
export function WaterJug3D({
  level,
  warn,
  shut,
  failed,
  label,
}: {
  level: number;
  warn: number;
  shut: number;
  failed?: boolean;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const mountRef = useRef<HTMLDivElement>(null);
  const setLevel = useRef<(value: number) => void>(() => {});
  const pct = Math.max(0, Math.min(100, Number.isFinite(level) ? level : 0));
  const tone = pct >= shut ? 'critical' : pct >= warn ? 'warn' : 'ok';

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(1.15, 0.35, 2.35);
    camera.lookAt(0, 0.05, 0);

    scene.add(new THREE.AmbientLight(0xc9d7e4, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.2, 3.2, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ec8ff, 0.55);
    rim.position.set(-2, 1, -1);
    scene.add(rim);

    const pts: THREE.Vector2[] = [];
    const profile: [number, number][] = [
      [0.02, -0.72],
      [0.28, -0.72],
      [0.42, -0.55],
      [0.46, -0.15],
      [0.4, 0.28],
      [0.3, 0.52],
      [0.18, 0.68],
      [0.16, 0.78],
      [0.22, 0.84],
    ];
    for (const [x, y] of profile) pts.push(new THREE.Vector2(x, y));
    const glassGeo = new THREE.LatheGeometry(pts, 48);
    const glass = new THREE.Mesh(
      glassGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0xd7e6f2,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.92,
        thickness: 0.35,
        transparent: true,
        opacity: 1,
        ior: 1.45,
      }),
    );
    scene.add(glass);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 1.35, 40),
      new THREE.MeshPhysicalMaterial({
        color: 0x2aa7c9,
        roughness: 0.15,
        metalness: 0,
        transmission: 0.35,
        thickness: 0.6,
        transparent: true,
        opacity: 0.92,
      }),
    );
    water.position.y = -0.7;
    water.scale.y = 0.08;
    scene.add(water);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0xe7d7bf, roughness: 0.45 }),
    );
    cap.position.y = 0.9;
    scene.add(cap);

    const state = { fill: 0.08 };
    let tween: gsap.core.Tween | null = null;
    setLevel.current = (value: number) => {
      const next = Math.max(0.06, Math.min(1, value / 100));
      tween?.kill();
      if (reduce) {
        state.fill = next;
        water.scale.y = next;
        water.position.y = -0.68 + next * 0.62;
        return;
      }
      tween = gsap.to(state, {
        fill: next,
        duration: 0.9,
        ease: 'power3.out',
        onUpdate: () => {
          water.scale.y = state.fill;
          water.position.y = -0.68 + state.fill * 0.62;
        },
      });
    };
    setLevel.current(level);

    let frame = 0;
    const clock = new THREE.Clock();
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const t = clock.getElapsedTime();
      if (!reduce) glass.rotation.y = t * 0.35;
      water.rotation.y = glass.rotation.y;
      cap.rotation.y = glass.rotation.y;
      renderer.render(scene, camera);
    };
    draw();

    const resize = () => {
      const w = host.clientWidth || 96;
      const h = host.clientHeight || 128;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      tween?.kill();
      obs.disconnect();
      glassGeo.dispose();
      (glass.material as THREE.Material).dispose();
      (water.geometry as THREE.BufferGeometry).dispose();
      (water.material as THREE.Material).dispose();
      (cap.geometry as THREE.BufferGeometry).dispose();
      (cap.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // mount once; level updates go through the ref + a separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  useEffect(() => {
    setLevel.current(level);
  }, [level]);

  return (
    <div className={`water-jug tone-${tone}${failed ? ' is-failed' : ''}`}>
      <div ref={mountRef} className="water-jug-canvas" role="img" aria-label={label ? `${label} ${pct.toFixed(0)} percent` : `${pct.toFixed(0)} percent`} />
      <strong className="water-jug-pct">{pct.toFixed(0)}%</strong>
      {label && <span className="water-jug-label">{label}</span>}
    </div>
  );
}
