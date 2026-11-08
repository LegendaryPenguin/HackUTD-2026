import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, Clock, Gauge, MapPin, Play, RotateCcw,
  Sparkles, Star, Timer, Trophy, Truck,
} from 'lucide-react';
import { useStore } from '../state/store';
import { buildDrivePoints, routeCheckpoints } from '../lib/driveMap';
import {
  COACH_STORAGE_KEY, gradeRun, missionFromFailure, practiceMissions,
  type DriveMission, type GradeResult, type RunStats,
} from '../lib/driveMission';
import { fmt } from '../lib/model';
import { DriveScene, type DriveTelemetry } from '../components/drive/DriveScene';
import { buildCoachSteps, DriveCoachPanel, type CoachAllow, type CoachStep } from '../components/drive/DriveCoach';

type Flow = 'select' | 'brief' | 'coach' | 'run' | 'finish';

const emptyTelem: DriveTelemetry = {
  speed: 0, dist: 0, heading: 0, bearing: 0, aligned: false, x: 0, z: 0, steered: false,
  onRoad: true, checkpointHits: [],
};

function readCoachSeen() {
  try { return localStorage.getItem(COACH_STORAGE_KEY) === '1'; } catch { return false; }
}
function writeCoachSeen() {
  try { localStorage.setItem(COACH_STORAGE_KEY, '1'); } catch { /* ignore */ }
}

export default function Drive() {
  const { dataset, analysis } = useStore();
  const limits = dataset?.network.defaults.tank_limits_pct ?? { warning: 85, shutdown: 92 };

  const failureMissions = useMemo(() => {
    if (!analysis) return [] as DriveMission[];
    return analysis.orderedFailures.map((c) => missionFromFailure(c, limits));
  }, [analysis, limits]);

  const [flow, setFlow] = useState<Flow>('select');
  const [mission, setMission] = useState<DriveMission | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [best, setBest] = useState<Record<string, { sec: number; stars: number }>>({});
  const [resetKey, setResetKey] = useState(0);
  const [telem, setTelem] = useState<DriveTelemetry>(emptyTelem);
  const [coachIdx, setCoachIdx] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [gateFlash, setGateFlash] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const flowRef = useRef<Flow>('select');
  const celebrateLock = useRef(false);
  const roadSamples = useRef({ on: 0, total: 0 });
  const peakSpeed = useRef(0);
  const hitsRef = useRef<string[]>([]);
  const prevHits = useRef(0);
  flowRef.current = flow;

  const map = useMemo(() => {
    if (!dataset || !mission) return null;
    return buildDrivePoints(dataset, mission.systemId);
  }, [dataset, mission]);

  const checkpoints = useMemo(() => {
    if (!map) return [];
    const yard = map.points.find((p) => p.kind === 'yard');
    if (!yard || !mission) return [];
    const n = mission.difficulty.tier === 'critical' ? 3
      : mission.difficulty.tier === 'urgent' ? 3
        : 2;
    return routeCheckpoints(map.roads, yard.id, mission.facilityId, n);
  }, [map, mission]);

  const practice = useMemo(() => {
    if (!dataset) return [] as DriveMission[];
    const first = dataset.network.systems[0];
    if (!first) return [];
    const pts = buildDrivePoints(dataset, first.id).points;
    return practiceMissions(pts, first.id);
  }, [dataset]);

  const missions = failureMissions.length > 0 ? failureMissions : practice;
  const steps = useMemo(() => (mission ? buildCoachSteps(mission) : [] as CoachStep[]), [mission]);
  const step = steps[coachIdx] ?? null;

  const allow: CoachAllow | 'all' =
    flow === 'run' || flow === 'finish' ? 'all'
      : flow === 'coach' && step ? step.allow
        : {};

  const playing =
    (flow === 'run' || flow === 'finish') ||
    (flow === 'coach' && !!step && !step.freeze && !celebrating);

  useEffect(() => {
    if (flow !== 'run') {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      if (startRef.current != null) setElapsed((performance.now() - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [flow]);

  useEffect(() => {
    celebrateLock.current = false;
    setCelebrating(false);
  }, [coachIdx]);

  const advanceCoach = () => {
    if (!step) return;
    if (step.id === 'go' || coachIdx >= steps.length - 1) {
      writeCoachSeen();
      beginRun();
      return;
    }
    setCoachIdx((i) => i + 1);
  };

  const succeedStep = () => {
    if (celebrateLock.current || celebrating) return;
    celebrateLock.current = true;
    setCelebrating(true);
    window.setTimeout(() => {
      setCelebrating(false);
      celebrateLock.current = false;
      advanceCoach();
    }, 900);
  };

  const onTelemetry = (t: DriveTelemetry) => {
    setTelem(t);
    hitsRef.current = t.checkpointHits;
    if (t.checkpointHits.length > prevHits.current) {
      const n = t.checkpointHits.length;
      prevHits.current = n;
      setGateFlash(`Gate ${n} cleared`);
      window.setTimeout(() => setGateFlash(null), 1100);
    }
    peakSpeed.current = Math.max(peakSpeed.current, t.speed);
    if (flowRef.current === 'run') {
      roadSamples.current.total += 1;
      if (t.onRoad) roadSamples.current.on += 1;
    }
    if (flowRef.current !== 'coach' || !step || step.mode !== 'practice' || celebrating) return;
    if (step.check?.(t)) succeedStep();
  };

  const beginRun = () => {
    setFlow('run');
    setElapsed(0);
    setGrade(null);
    setGateFlash(null);
    roadSamples.current = { on: 0, total: 0 };
    peakSpeed.current = 0;
    hitsRef.current = [];
    prevHits.current = 0;
    startRef.current = performance.now();
    setResetKey((k) => k + 1);
  };

  const pickMission = (m: DriveMission) => {
    setMission(m);
    setFlow('brief');
    setElapsed(0);
    setGrade(null);
    startRef.current = null;
    setTelem(emptyTelem);
    setCoachIdx(0);
    setCelebrating(false);
    setResetKey((k) => k + 1);
  };

  const startFromBrief = (withCoach: boolean) => {
    if (!mission) return;
    if (withCoach) {
      setCoachIdx(0);
      setFlow('coach');
      setResetKey((k) => k + 1);
      return;
    }
    writeCoachSeen();
    beginRun();
  };

  const onArrive = (aligned: boolean) => {
    if (flowRef.current !== 'run') return;
    const sec = startRef.current != null ? (performance.now() - startRef.current) / 1000 : elapsed;
    setElapsed(sec);
    const onRoadPct = roadSamples.current.total
      ? roadSamples.current.on / roadSamples.current.total
      : 1;
    const stats: RunStats = {
      sec,
      onRoadPct,
      checkpointsHit: hitsRef.current.length,
      checkpointsTotal: checkpoints.length,
      alignedArrival: aligned,
      peakSpeed: peakSpeed.current,
    };
    if (mission) {
      const g = gradeRun(stats, mission.difficulty.timeLimitSec);
      setGrade(g);
      setBest((b) => {
        const prev = b[mission.id];
        if (prev == null || g.stars > prev.stars || (g.stars === prev.stars && sec < prev.sec)) {
          return { ...b, [mission.id]: { sec, stars: g.stars } };
        }
        return b;
      });
    }
    setFlow('finish');
  };

  const restartRun = () => beginRun();

  const backToSelect = () => {
    setFlow('select');
    setMission(null);
    setElapsed(0);
    setGrade(null);
    startRef.current = null;
  };

  if (!dataset) {
    return (
      <div className="empty">
        <div>
          <h2 className="page-title">Drive</h2>
          <p>Load a dataset to train truck runs to the tanks.</p>
        </div>
      </div>
    );
  }

  const targetPoint = map?.points.find((p) => p.id === mission?.facilityId) ?? null;
  const over = mission ? elapsed > mission.difficulty.timeLimitSec : false;
  const cpHit = telem.checkpointHits.length;
  const cpTotal = checkpoints.length;
  const nextGate = checkpoints.find((c) => !telem.checkpointHits.includes(c.id)) ?? null;
  const aim = nextGate && flow === 'run'
    ? nextGate
    : targetPoint;
  const aimBearing = aim
    ? Math.atan2(aim.x - telem.x, aim.z - telem.z)
    : telem.bearing;
  const needle = ((aimBearing - telem.heading) * 180) / Math.PI;
  const onRoadPctLive = roadSamples.current.total
    ? Math.round((roadSamples.current.on / roadSamples.current.total) * 100)
    : 100;

  return (
    <div className="drive-page">
      {map && mission && targetPoint && flow !== 'select' && (
        <DriveScene
          points={map.points}
          roads={map.roads}
          targetId={mission.facilityId}
          playing={playing && flow !== 'finish'}
          difficulty={mission.difficulty}
          allow={allow}
          onArrive={onArrive}
          onTelemetry={onTelemetry}
          resetKey={resetKey}
          checkpoints={flow === 'run' || flow === 'finish' ? checkpoints : []}
          navAim={flow === 'run' ? (nextGate ? { x: nextGate.x, z: nextGate.z } : null) : null}
        />
      )}

      {flow === 'select' && (
        <div className="drive-select">
          <div className="drive-select-inner">
            <p className="drive-eyebrow">Night Tide · truck school</p>
            <h1>Pick a haul that needs a truck.</h1>
            <p className="drive-lead">
              {failureMissions.length > 0
                ? 'Follow the lit roads, clear amber checkpoints, hit the beacon. Score is time + route discipline.'
                : 'No active pump failures — practice pads still grade your clock and road discipline.'}
            </p>

            <div className="drive-mission-grid">
              {missions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`drive-mission-card tier-${m.difficulty.tier}`}
                  onClick={() => pickMission(m)}
                >
                  <div className="drive-mission-card-top">
                    <span className={`chip ${m.difficulty.tone}`}>{m.difficulty.label}</span>
                    <span className="chip ghost">{m.systemId}</span>
                  </div>
                  <h3>{m.title}</h3>
                  <p>{m.subtitle}</p>
                  <ul>
                    {m.levelPct != null && <li>Tank {fmt.pct(m.levelPct)}</li>}
                    {m.hoursToLimit != null && isFinite(m.hoursToLimit) && (
                      <li>Trip in ~{fmt.dur(m.hoursToLimit)}</li>
                    )}
                    <li>Clock {m.difficulty.timeLimitSec}s</li>
                    {m.responseMin != null && <li>Field ETA {m.responseMin} min</li>}
                  </ul>
                  {best[m.id] && (
                    <div className="drive-card-stars" aria-label={`${best[m.id].stars} stars`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={12}
                          fill={i < best[m.id].stars ? 'var(--amber)' : 'transparent'}
                          color={i < best[m.id].stars ? 'var(--amber)' : 'var(--ink-3)'}
                        />
                      ))}
                      <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                        {best[m.id].sec.toFixed(1)}s
                      </span>
                    </div>
                  )}
                  <span className="drive-mission-cta">
                    <Truck size={14} /> Brief this run
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {flow === 'brief' && mission && (
        <div className="drive-select">
          <div className="drive-select-inner narrow">
            <button type="button" className="btn ghost sm" onClick={backToSelect}>
              <ArrowLeft size={14} /> All hauls
            </button>
            <p className="drive-eyebrow">Pre-run briefing</p>
            <h1>{mission.title}</h1>
            <p className="drive-lead">
              Objectives: follow the aqua roads, pass amber checkpoints, enter the tank ring facing the pad. Faster and cleaner earns more stars.
            </p>

            <div className="drive-brief-grid">
              <div className="drive-brief-card">
                <p className="drive-brief-label"><AlertTriangle size={14} /> Why this pad</p>
                <ul>
                  {mission.difficulty.why.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
              <div className="drive-brief-card">
                <p className="drive-brief-label"><Sparkles size={14} /> How you score</p>
                <ul>
                  <li>Deliver inside {mission.difficulty.timeLimitSec}s</li>
                  <li>Stay on lit lease roads</li>
                  <li>Clear every checkpoint gate</li>
                  <li>Line up clean into the ring</li>
                  {mission.difficulty.stakes.slice(0, 1).map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </div>

            {mission.evidence.length > 0 && (
              <div className="drive-brief-evidence">
                {mission.evidence.map((e) => <span key={e} className="chip ghost">{e}</span>)}
              </div>
            )}

            <div className="drive-brief-actions">
              <button type="button" className="btn primary" onClick={() => startFromBrief(true)}>
                <Play size={14} /> {readCoachSeen() ? 'Replay lesson' : 'Start with coach'}
              </button>
              <button type="button" className="btn ghost" onClick={() => startFromBrief(false)}>
                Skip to timed run
              </button>
            </div>
          </div>
        </div>
      )}

      {(flow === 'coach' || flow === 'run' || flow === 'finish') && mission && (
        <>
          <div className="drive-hud top">
            <div className="drive-mission">
              <span className={`chip ${mission.difficulty.tone}`}>{mission.difficulty.label}</span>
              <h1>{flow === 'coach' ? 'Coach on deck' : `Haul to ${mission.tankLabel}`}</h1>
              <p>
                {flow === 'coach'
                  ? 'Stop-and-go lesson — succeed each tip to unlock the next.'
                  : 'Follow lit roads · amber gates · aqua beacon'}
              </p>
            </div>
            {flow !== 'coach' && (
              <div className="drive-stats">
                <div className={`drive-stat ${over ? 'hot' : ''}`}>
                  <Timer size={14} />
                  <span>{elapsed.toFixed(1)}s / {mission.difficulty.timeLimitSec}s</span>
                </div>
                <div className="drive-stat">
                  <Gauge size={14} />
                  <span>{Math.round(telem.speed * 2.2)} mph</span>
                </div>
                <div className={`drive-stat ${telem.onRoad ? '' : 'hot'}`}>
                  <MapPin size={14} />
                  <span>{telem.onRoad ? 'On road' : 'Off road'}</span>
                </div>
                <div className="drive-stat">
                  <Check size={14} />
                  <span>{cpHit}/{cpTotal} gates</span>
                </div>
                {best[mission.id] != null && (
                  <div className="drive-stat best">
                    <Trophy size={14} />
                    <span>{best[mission.id].sec.toFixed(1)}s · {best[mission.id].stars}★</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="drive-compass" aria-hidden>
            <div className="drive-compass-ring">
              <i style={{ transform: `rotate(${needle}deg)` }} />
            </div>
            <span>{nextGate && flow === 'run' ? 'Next gate' : 'Target'}</span>
          </div>

          {flow === 'run' && (
            <div className="drive-obj-live" aria-live="polite">
              <h3>Objectives</h3>
              <ol>
                {cpTotal > 0 && (
                  <li className={cpHit >= cpTotal ? 'done' : 'now'}>
                    <i>{cpHit >= cpTotal ? '✓' : cpHit}</i>
                    Clear gates {cpHit}/{cpTotal}
                  </li>
                )}
                <li className={telem.onRoad ? (onRoadPctLive >= 72 ? 'done' : '') : 'now'}>
                  <i>{onRoadPctLive >= 72 ? '✓' : '·'}</i>
                  Stay on roads · {onRoadPctLive}%
                </li>
                <li className={cpTotal === 0 || !nextGate ? 'now' : ''}>
                  <i>·</i>
                  Line up into the beacon ring
                </li>
                <li className={over ? 'now' : ''}>
                  <i>{over ? '!' : '·'}</i>
                  Beat {mission.difficulty.timeLimitSec}s clock
                </li>
              </ol>
            </div>
          )}

          {gateFlash && <div className="drive-gate-flash">{gateFlash}</div>}

          {flow === 'run' && map && (
            <DriveMinimap
              points={map.points}
              roads={map.roads}
              x={telem.x}
              z={telem.z}
              yaw={telem.heading}
              targetId={mission.facilityId}
              checkpoints={checkpoints}
              hits={telem.checkpointHits}
              nextId={nextGate?.id ?? null}
            />
          )}

          {flow === 'run' && (
            <div className="drive-hud bottom">
              <div className="drive-keys">
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span>{nextGate ? 'amber arrow → next gate' : 'aqua arrow → beacon ring'}</span>
              </div>
              <div className="drive-actions">
                <button type="button" className="btn ghost sm" onClick={restartRun}>
                  <RotateCcw size={14} /> Restart
                </button>
                <button type="button" className="btn ghost sm" onClick={backToSelect}>
                  Change haul
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {flow === 'coach' && step && (
        <DriveCoachPanel
          step={step}
          stepIndex={coachIdx}
          total={steps.length}
          celebrating={celebrating}
          onContinue={advanceCoach}
          onSkipAll={() => { writeCoachSeen(); beginRun(); }}
        />
      )}

      {flow === 'finish' && mission && grade && (
        <div className="drive-finish">
          <div className="drive-finish-card">
            <span className={`chip ${grade.tone}`}>{grade.label}</span>
            <div className="drive-stars" aria-label={`${grade.stars} of 5 stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={18}
                  fill={i < grade.stars ? 'var(--amber)' : 'transparent'}
                  color={i < grade.stars ? 'var(--amber)' : 'var(--ink-3)'}
                />
              ))}
            </div>
            <h2>Arrived · {mission.tankLabel}</h2>
            <p className="drive-finish-time">{elapsed.toFixed(2)}s</p>
            <p className="muted">
              Score {grade.score}
              <Clock size={12} style={{ verticalAlign: -2, marginLeft: 8 }} /> Window {mission.difficulty.timeLimitSec}s
            </p>
            <ul className="drive-obj-list">
              {grade.objectives.map((o) => (
                <li key={o.id} className={o.done ? 'ok' : 'miss'}>
                  <span>{o.done ? '✓' : '·'}</span>
                  <div>
                    <strong>{o.label}</strong>
                    <small>{o.hint}</small>
                  </div>
                </li>
              ))}
            </ul>
            <div className="drive-actions">
              <button type="button" className="btn ghost" onClick={restartRun}>
                <RotateCcw size={14} /> Run again
              </button>
              <button type="button" className="btn primary" onClick={backToSelect}>
                Pick another haul
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriveMinimap({
  points,
  roads,
  x,
  z,
  yaw,
  targetId,
  checkpoints,
  hits,
  nextId,
}: {
  points: { id: string; x: number; z: number; kind: string }[];
  roads: { id: string; from: [number, number]; to: [number, number]; kind: string }[];
  x: number;
  z: number;
  yaw: number;
  targetId: string;
  checkpoints: { id: string; x: number; z: number }[];
  hits: string[];
  nextId: string | null;
}) {
  const pad = 12;
  const size = 148;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 40) * 1.25;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const to = (px: number, pz: number) => {
    const u = ((px - cx) / span + 0.5) * (size - pad * 2) + pad;
    const v = ((pz - cz) / span + 0.5) * (size - pad * 2) + pad;
    return [u, v] as const;
  };

  return (
    <div className="drive-minimap" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} rx="14" fill="rgba(6,14,20,0.82)" stroke="rgba(140,190,210,0.2)" />
        {roads.filter((r) => r.kind !== 'lease').map((r) => {
          const [a, b] = [to(r.from[0], r.from[1]), to(r.to[0], r.to[1])];
          return (
            <line
              key={r.id}
              x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
              stroke="rgba(94,200,216,0.35)"
              strokeWidth={r.kind === 'arterial' ? 2.2 : 1.4}
              strokeLinecap="round"
            />
          );
        })}
        {checkpoints.map((c) => {
          const [u, v] = to(c.x, c.z);
          const hit = hits.includes(c.id);
          const next = c.id === nextId;
          return (
            <circle
              key={c.id}
              cx={u}
              cy={v}
              r={next ? 5 : 3.5}
              fill={hit ? '#7dcea0' : next ? '#ffd27a' : '#e8c07a'}
              stroke={next ? '#fff4d6' : 'none'}
              strokeWidth={next ? 1.2 : 0}
            />
          );
        })}
        {points.map((p) => {
          const [u, v] = to(p.x, p.z);
          const fill = p.id === targetId ? '#5ec8d8' : p.kind === 'yard' ? '#7eb8ff' : '#4a606c';
          return <circle key={p.id} cx={u} cy={v} r={p.id === targetId ? 4.5 : 2.8} fill={fill} />;
        })}
        {(() => {
          const [u, v] = to(x, z);
          const deg = (yaw * 180) / Math.PI;
          return (
            <g transform={`translate(${u} ${v}) rotate(${deg})`}>
              <polygon points="0,-5 4,5 -4,5" fill="#e8f4f8" />
            </g>
          );
        })()}
      </svg>
      <span>Lease map</span>
    </div>
  );
}
