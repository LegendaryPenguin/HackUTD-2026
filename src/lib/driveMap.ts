import type { Dataset } from './types';
import { fmt } from './model';
import { buildPlantRibbons, type RoadRibbon } from './driveRoads';

export type DrivePointKind = 'tank' | 'yard' | 'disposal';

export type DrivePoint = {
  id: string;
  kind: DrivePointKind;
  label: string;
  systemId: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
};

export type DriveRoad = {
  id: string;
  fromId: string;
  toId: string;
  from: [number, number];
  to: [number, number];
  kind: 'arterial' | 'spur' | 'lease';
};

export type DriveMap = {
  originLat: number;
  originLon: number;
  scale: number;
  points: DrivePoint[];
  roads: DriveRoad[];
  ribbons: RoadRibbon[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const M_PER_DEG_LAT = 111_320;

function compress(v: number, power = 0.62): number {
  const s = Math.sign(v);
  return s * Math.pow(Math.abs(v), power);
}

/**
 * Full-field drive map from every system in the dataset:
 * tanks + truck yards + disposal sites, scaled into a playable lease.
 */
export function buildFieldMap(ds: Dataset, preferSystemId?: string): DriveMap {
  const systems = ds.network.systems;
  const prefer = systems.find((s) => s.id === preferSystemId) ?? systems[0];
  const originLat = prefer?.truck_yard[0] ?? prefer?.facilities[0]?.lat ?? 32.0;
  const originLon = prefer?.truck_yard[1] ?? prefer?.facilities[0]?.lon ?? -102.0;
  const cosLat = Math.cos((originLat * Math.PI) / 180);

  const raw: Omit<DrivePoint, 'x' | 'z'>[] = [];
  for (const s of systems) {
    for (const f of s.facilities) {
      if (!f.tank) continue;
      raw.push({
        id: f.id,
        kind: 'tank',
        label: fmt.short(f.id),
        systemId: s.id,
        lat: f.lat,
        lon: f.lon,
      });
    }
    raw.push({
      id: `${s.id}-yard`,
      kind: 'yard',
      label: `${s.id} yard`,
      systemId: s.id,
      lat: s.truck_yard[0],
      lon: s.truck_yard[1],
    });
    raw.push({
      id: s.disposal_site.id || `${s.id}-disposal`,
      kind: 'disposal',
      label: s.disposal_site.id || `${s.id} SWD`,
      systemId: s.id,
      lat: s.disposal_site.lat,
      lon: s.disposal_site.lon,
    });
  }

  let maxM = 1;
  for (const p of raw) {
    const dxM = (p.lon - originLon) * M_PER_DEG_LAT * cosLat;
    const dzM = (p.lat - originLat) * M_PER_DEG_LAT;
    maxM = Math.max(maxM, Math.hypot(dxM, dzM));
  }
  // Larger playable field so pads aren’t stacked on top of each other
  const targetR = Math.min(210, Math.max(130, 90 + Math.sqrt(Math.max(1, raw.length)) * 22));
  const scale = targetR / Math.pow(maxM, 0.58);

  const points: DrivePoint[] = raw.map((p) => {
    const dxM = (p.lon - originLon) * M_PER_DEG_LAT * cosLat;
    const dzM = (p.lat - originLat) * M_PER_DEG_LAT;
    return {
      ...p,
      x: compress(dxM) * scale,
      z: compress(dzM) * scale,
    };
  });

  // Prefer yard for the active system as first yard (spawn)
  const preferYardId = `${prefer?.id ?? ''}-yard`;
  points.sort((a, b) => {
    if (a.id === preferYardId) return -1;
    if (b.id === preferYardId) return 1;
    return 0;
  });

  const byPos = new Map<string, DrivePoint[]>();
  for (const p of points) {
    const key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    const arr = byPos.get(key) ?? [];
    arr.push(p);
    byPos.set(key, arr);
  }
  for (const group of byPos.values()) {
    if (group.length < 2) continue;
    group.forEach((p, i) => {
      const a = (i / group.length) * Math.PI * 2;
      p.x += Math.cos(a) * 12;
      p.z += Math.sin(a) * 12;
    });
  }

  // Soft repulsion so facilities keep breathing room
  const minDist = 26;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d >= minDist) continue;
        const push = (minDist - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

  const { ribbons, roads } = buildPlantRibbons(points);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  return {
    originLat,
    originLon,
    scale,
    points,
    roads,
    ribbons,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

export function buildDriveMap(ds: Dataset, systemId: string): DriveMap {
  return buildFieldMap(ds, systemId);
}

export function findPoint(map: DriveMap, id: string): DrivePoint | undefined {
  return map.points.find((p) => p.id === id);
}

export function tanksOf(map: DriveMap, systemId?: string): DrivePoint[] {
  return map.points.filter((p) => p.kind === 'tank' && (!systemId || p.systemId === systemId));
}

export function yardsOf(map: DriveMap, systemId?: string): DrivePoint[] {
  return map.points.filter((p) => p.kind === 'yard' && (!systemId || p.systemId === systemId));
}

export function distToRoads(x: number, z: number, roads: DriveRoad[]): number {
  let best = Infinity;
  for (const r of roads) {
    const ax = r.from[0], az = r.from[1];
    const bx = r.to[0], bz = r.to[1];
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - ax) * abx + (z - az) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
  }
  return best;
}
