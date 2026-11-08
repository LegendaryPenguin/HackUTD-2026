import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Check, Clock, Gauge, Map as MapIcon, MapPin, Play, RotateCcw, Star, Timer, Trophy, Truck,
} from 'lucide-react';
import { useStore } from '../state/store';
import { buildFieldMap } from '../lib/driveMap';
import {
  approachLesson, gradeRun, lessonAfterPad, offRoadLesson, openingLesson, practiceMissions, truckRecommendedMissions,
  type DriveLesson, type DriveMission, type GradeResult, type RunStats,
} from '../lib/driveMission';
import { fmt } from '../lib/model';
import { DriveScene, type DriveTelemetry } from '../components/drive/DriveScene';

type Flow = 'select' | 'story' | 'run' | 'finish';

function storyFor(m: DriveMission) {
  const pads = m.stops.map((s) => s.label).join(', then ');
  if (m.kind === 'practice') {
    return {
      eyebrow: 'Story time',
      title: 'Night drill on the lease',
      paras: [
        'Console is quiet. No real trip call. Just you, a loaded water truck, and the ring road.',
        `Drive the pads in order: ${pads}. Stay on asphalt. Treat every tank like it is filling.`,
      ],
    };
  }
  const when = fmt.dayTime(m.atUnix);
  const level = m.levelPct != null ? ` The tank is around ${fmt.pct(m.levelPct)}.` : '';
  return {
    eyebrow: 'Story time',
    title: `Dispatch · ${m.tankLabel}`,
    paras: [
      `${when}. The best plan sends water trucks, not wait and hope.${level}`,
      `${m.planLabel}. You start at the yard. Hit every pad in order: ${pads}. If you miss the clock, the tank trips.`,
    ],
  };
}

const emptyTelem: DriveTelemetry = {
  speed: 0, dist: 0, heading: 0, bearing: 0, aligned: false, x: 0, z: 0, steered: false,
  onRoad: true, padHits: [],
};

export default function Drive() {
  const { dataset, analysis } = useStore();

  const fieldMap = useMemo(() => {
    if (!dataset) return null;
    const prefer = analysis?.orderedFailures[0]?.facility.system
      ?? dataset.network.systems[0]?.id;
    return buildFieldMap(dataset, prefer);
  }, [dataset, analysis]);

  const truckMissions = useMemo(() => {
    if (!dataset || !analysis || !fieldMap) return [] as DriveMission[];
    const yard = fieldMap.points.find((p) => p.kind === 'yard');
    return truckRecommendedMissions(dataset, analysis, fieldMap.points, yard);
  }, [dataset, analysis, fieldMap]);

  const practice = useMemo(() => {
    if (!dataset || !fieldMap || truckMissions.length > 0) return [] as DriveMission[];
    const sys = dataset.network.systems[0]?.id ?? 'S1';
    const yard = fieldMap.points.find((p) => p.kind === 'yard');
    return practiceMissions(fieldMap.points, sys, yard);
  }, [dataset, fieldMap, truckMissions.length]);

  const missions = truckMissions.length > 0 ? truckMissions : practice;

  const [flow, setFlow] = useState<Flow>('select');
  const [mission, setMission] = useState<DriveMission | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [best, setBest] = useState<Record<string, { sec: number; stars: number }>>({});
  const [resetKey, setResetKey] = useState(0);
  const [telem, setTelem] = useState<DriveTelemetry>(emptyTelem);
  const [padFlash, setPadFlash] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [lesson, setLesson] = useState<DriveLesson | null>(null);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const flowRef = useRef<Flow>('select');
  const roadSamples = useRef({ on: 0, total: 0 });
  const peakSpeed = useRef(0);
  const prevHits = useRef(0);
  const seenLessons = useRef(new Set<string>());
  const pauseAccum = useRef(0);
  const lessonOpenRef = useRef(false);
  flowRef.current = flow;
  lessonOpenRef.current = !!lesson;

  useEffect(() => {
    if (flow !== 'run') {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (lessonOpenRef.current) {
        pauseAccum.current += dt * 1000;
      } else if (startRef.current != null) {
        setElapsed((now - startRef.current - pauseAccum.current) / 1000);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [flow]);

  const showLesson = (L: DriveLesson) => {
    if (seenLessons.current.has(L.id)) return;
    seenLessons.current.add(L.id);
    setLesson(L);
  };

  const pickMission = (m: DriveMission) => {
    setMission(m);
    setFlow('story');
    setElapsed(0);
    setGrade(null);
    setPadFlash(null);
    setLesson(null);
    setTelem(emptyTelem);
    startRef.current = null;
    seenLessons.current = new Set();
    setResetKey((k) => k + 1);
  };

  const beginRun = (m: DriveMission = mission!) => {
    if (!m) return;
    setMission(m);
    setFlow('run');
    setElapsed(0);
    setGrade(null);
    setPadFlash(null);
    setTelem(emptyTelem);
    roadSamples.current = { on: 0, total: 0 };
    peakSpeed.current = 0;
    prevHits.current = 0;
    pauseAccum.current = 0;
    seenLessons.current = new Set();
    startRef.current = performance.now();
    setResetKey((k) => k + 1);
    setLesson(openingLesson(m));
    seenLessons.current.add('open');
  };

  const onTelemetry = (t: DriveTelemetry) => {
    setTelem(t);
    if (t.padHits.length > prevHits.current && mission) {
      const idx = prevHits.current;
      prevHits.current = t.padHits.length;
      const last = t.padHits[t.padHits.length - 1];
      const stop = mission.stops.find((s) => s.id === last);
      setPadFlash(stop ? `Delivered · ${stop.label}` : 'Pad delivered');
      window.setTimeout(() => setPadFlash(null), 1200);
      // Teach between pads; last pad goes straight to finish grade
      if (stop && t.padHits.length < mission.stops.length) {
        showLesson(lessonAfterPad(mission, idx, stop));
      }
    }
    peakSpeed.current = Math.max(peakSpeed.current, t.speed);
    if (flowRef.current === 'run' && !lessonOpenRef.current && mission) {
      roadSamples.current.total += 1;
      if (t.onRoad) roadSamples.current.on += 1;
      else showLesson(offRoadLesson());

      const next = mission.stops.find((s) => !t.padHits.includes(s.id));
      if (next && t.dist > 0 && t.dist < 28) {
        showLesson(approachLesson(next));
      }
    }
  };

  const onArrive = () => {
    if (flowRef.current !== 'run' || !mission) return;
    setLesson(null);
    const sec = startRef.current != null
      ? (performance.now() - startRef.current - pauseAccum.current) / 1000
      : elapsed;
    setElapsed(sec);
    const onRoadPct = roadSamples.current.total
      ? roadSamples.current.on / roadSamples.current.total
      : 1;
    const stats: RunStats = {
      sec,
      onRoadPct,
      padsHit: telem.padHits.length || mission.stops.length,
      padsTotal: mission.stops.length,
      peakSpeed: peakSpeed.current,
    };
    if (stats.padsHit < stats.padsTotal) stats.padsHit = stats.padsTotal;
    const g = gradeRun(stats, mission.difficulty.timeLimitSec);
    setGrade(g);
    setBest((b) => {
      const prev = b[mission.id];
      if (prev == null || g.stars > prev.stars || (g.stars === prev.stars && sec < prev.sec)) {
        return { ...b, [mission.id]: { sec, stars: g.stars } };
      }
      return b;
    });
    setFlow('finish');
  };

  const restartRun = () => {
    if (!mission) return;
    beginRun(mission);
  };

  const backToHauls = () => {
    setFlow('select');
    setMission(null);
    setElapsed(0);
    setGrade(null);
    setLesson(null);
    startRef.current = null;
  };

  if (!dataset) {
    return (
      <div className="empty">
        <div>
          <h2 className="page-title">Drive</h2>
          <p>Load a dataset to train truck runs to the tanks.</p>
          <div className="drive-empty-actions">
            <Link to="/" className="btn primary">
              <MapIcon size={14} /> Back to Map
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const over = mission ? elapsed > mission.difficulty.timeLimitSec : false;
  const padsHit = telem.padHits.length;
  const padsTotal = mission?.stops.length ?? 0;
  const nextStop = mission?.stops.find((s) => !telem.padHits.includes(s.id)) ?? null;
  const nextPt = nextStop && fieldMap
    ? fieldMap.points.find((p) => p.id === nextStop.facilityId)
    : null;
  const aimBearing = nextPt
    ? Math.atan2(nextPt.x - telem.x, nextPt.z - telem.z)
    : telem.bearing;
  const needle = ((aimBearing - telem.heading) * 180) / Math.PI;
  const onRoadPctLive = roadSamples.current.total
    ? Math.round((roadSamples.current.on / roadSamples.current.total) * 100)
    : 100;

  return (
    <div className={`drive-page flow-${flow}`}>
      {fieldMap && mission && (flow === 'story' || flow === 'run' || flow === 'finish') && (
        <DriveScene
          points={fieldMap.points}
          roads={fieldMap.roads}
          ribbons={fieldMap.ribbons}
          stops={mission.stops}
          playing={flow === 'run'}
          difficulty={mission.difficulty}
          onArrive={onArrive}
          onTelemetry={onTelemetry}
          resetKey={resetKey}
          lessonOpen={!!lesson}
        />
      )}

      {flow === 'run' && lesson && (
        <div className="drive-lesson" role="dialog" aria-label="Lesson">
          <div className={`drive-lesson-card tone-${lesson.tone}`}>
            <p className="drive-eyebrow">Field radio</p>
            <h2>{lesson.title}</h2>
            <p>{lesson.body}</p>
            <button type="button" className="btn primary" onClick={() => setLesson(null)}>
              Got it. Keep driving
            </button>
          </div>
        </div>
      )}

      {flow === 'story' && mission && (() => {
        const story = storyFor(mission);
        return (
          <div className="drive-story">
            <div className="drive-story-card">
              <div className="drive-chrome-nav">
                <button type="button" className="btn ghost sm" onClick={backToHauls}>
                  <ArrowLeft size={14} /> All hauls
                </button>
                <Link to="/" className="btn ghost sm">
                  <MapIcon size={14} /> Map
                </Link>
              </div>
              <p className="drive-eyebrow">{story.eyebrow}</p>
              <h1>{story.title}</h1>
              {story.paras.map((p) => (
                <p key={p.slice(0, 24)} className="drive-story-p">{p}</p>
              ))}
              <ul className="drive-story-beats">
                <li><span className="chip aqua">{mission.stops.length} pads</span></li>
                <li><span className="chip ghost">{mission.difficulty.timeLimitSec}s clock</span></li>
                <li><span className={`chip ${mission.difficulty.tone}`}>{mission.difficulty.label}</span></li>
              </ul>
              <div className="drive-story-actions">
                <button type="button" className="btn primary" onClick={() => beginRun(mission)}>
                  <Play size={14} /> Start haul
                </button>
                <button type="button" className="btn ghost" onClick={backToHauls}>
                  Pick another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {flow === 'select' && (
        <div className="drive-select">
          <div className="drive-select-inner">
            <header className="drive-chrome">
              <div className="drive-chrome-nav">
                <Link to="/" className="btn ghost sm">
                  <MapIcon size={14} /> Back to Map
                </Link>
                <Link to="/plan" className="btn ghost sm">
                  Plan
                </Link>
              </div>
              <p className="drive-eyebrow">Water truck haul</p>
              <h1>When trucks were the call.</h1>
              <p className="drive-lead">
              {truckMissions.length > 0
                ? 'Each card is a moment the recommended plan sent water trucks. Pick one and haul the tank pads.'
                : 'No truck calls in this window. Run a practice pad loop across the field.'}
              </p>
            </header>

            <div className="drive-mission-grid drive-time-cards">
              {missions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`drive-mission-card drive-time-card tier-${m.difficulty.tier}`}
                  onClick={() => pickMission(m)}
                >
                  <div className="drive-mission-card-top">
                    <span className="drive-time-stamp">
                      <Clock size={12} />
                      {m.kind === 'practice' ? 'Practice' : fmt.dayTime(m.atUnix)}
                    </span>
                    <span className={`chip ${m.difficulty.tone}`}>{m.difficulty.label}</span>
                  </div>
                  <h3>{m.title}</h3>
                  <p>{m.subtitle}</p>
                  <ul>
                    <li>{m.stops.length} tank pads</li>
                    <li>{m.trucks}×{m.trips} trucks</li>
                    <li>Clock {m.difficulty.timeLimitSec}s</li>
                    {m.levelPct != null && <li>Tank {fmt.pct(m.levelPct)}</li>}
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
                    <Truck size={14} /> Drive now
                  </span>
                </button>
              ))}
            </div>

            <footer className="drive-select-foot">
              <Link to="/" className="btn ghost">
                <ArrowLeft size={14} /> Back to Map
              </Link>
            </footer>
          </div>
        </div>
      )}

      {(flow === 'run' || flow === 'finish') && mission && (
        <>
          <div className="drive-hud top">
            <div className="drive-hud-left">
              <div className="drive-mission">
                <div className="drive-mission-nav">
                  <button type="button" className="btn ghost sm" onClick={backToHauls}>
                    <ArrowLeft size={14} /> All hauls
                  </button>
                  <Link to="/" className="btn ghost sm">
                    <MapIcon size={14} /> Map
                  </Link>
                </div>
                <span className={`chip ${mission.difficulty.tone}`}>{mission.difficulty.label}</span>
                <h1>
                  {nextStop ? `Deliver · ${nextStop.label}` : 'Haul complete'}
                </h1>
                <p>
                  Pad {Math.min(padsHit + (nextStop ? 1 : 0), padsTotal)} of {padsTotal}
                  {mission.kind === 'truck_run' ? ` · ${fmt.dayTime(mission.atUnix)}` : ''}
                </p>
              </div>

              {flow === 'run' && (
                <div className="drive-obj-live" aria-live="polite">
                  <h3>Delivery tour</h3>
                  <ol>
                    {mission.stops.map((s, i) => {
                      const hit = telem.padHits.includes(s.id);
                      const now = s.id === nextStop?.id;
                      return (
                        <li key={s.id} className={hit ? 'done' : now ? 'now' : ''}>
                          <i>{hit ? '✓' : i + 1}</i>
                          {s.label}
                        </li>
                      );
                    })}
                    <li className={telem.onRoad ? (onRoadPctLive >= 72 ? 'done' : '') : 'now'}>
                      <i>{onRoadPctLive >= 72 ? '✓' : '·'}</i>
                      Stay on roads · {onRoadPctLive}%
                    </li>
                  </ol>
                </div>
              )}
            </div>
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
                <span>{padsHit}/{padsTotal} pads</span>
              </div>
              {best[mission.id] != null && (
                <div className="drive-stat best">
                  <Trophy size={14} />
                  <span>{best[mission.id].sec.toFixed(1)}s · {best[mission.id].stars}★</span>
                </div>
              )}
            </div>
          </div>

          {flow === 'run' && (
            <>
              <div className="drive-compass" aria-hidden>
                <div className="drive-compass-ring">
                  <i style={{ transform: `rotate(${needle}deg)` }} />
                </div>
                <span>{nextStop ? 'Next pad' : 'Done'}</span>
              </div>

              {padFlash && <div className="drive-gate-flash">{padFlash}</div>}

              {fieldMap && (
                <DriveMinimap
                  points={fieldMap.points}
                  roads={fieldMap.roads}
                  x={telem.x}
                  z={telem.z}
                  yaw={telem.heading}
                  stops={mission.stops}
                  hits={telem.padHits}
                  nextId={nextStop?.id ?? null}
                />
              )}

              <div className="drive-hud bottom">
                <div className="drive-keys">
                  <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                  <span>aqua arrow → next tank pad</span>
                </div>
                <div className="drive-actions">
                  <button type="button" className="btn ghost sm" onClick={restartRun}>
                    <RotateCcw size={14} /> Restart
                  </button>
                  <button type="button" className="btn ghost sm" onClick={backToHauls}>
                    <ArrowLeft size={14} /> All hauls
                  </button>
                  <Link to="/" className="btn primary sm">
                    <MapIcon size={14} /> Back to Map
                  </Link>
                </div>
              </div>
            </>
          )}
        </>
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
            <h2>{mission.stops.length} pads delivered</h2>
            <p className="drive-finish-time">{elapsed.toFixed(2)}s</p>
            <p className="muted">
              Score {grade.score}
              <Clock size={12} style={{ verticalAlign: -2, marginLeft: 8 }} /> Window {mission.difficulty.timeLimitSec}s
            </p>
            <div className="drive-finish-actions">
              <button type="button" className="btn primary" onClick={restartRun}>
                <RotateCcw size={14} /> Drive again
              </button>
              <button type="button" className="btn ghost" onClick={backToHauls}>
                <Truck size={14} /> All hauls
              </button>
              <Link to="/" className="btn ghost">
                <MapIcon size={14} /> Back to Map
              </Link>
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
  stops,
  hits,
  nextId,
}: {
  points: { id: string; x: number; z: number; kind: string }[];
  roads: { id: string; from: [number, number]; to: [number, number]; kind: string }[];
  x: number;
  z: number;
  yaw: number;
  stops: { id: string; facilityId: string }[];
  hits: string[];
  nextId: string | null;
}) {
  const pad = 12;
  const size = 148;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
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

  const roadSample = roads.filter((_, i) => i % 3 === 0 && _.kind !== 'lease');

  return (
    <div className="drive-minimap" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} rx="14" fill="rgba(6,14,20,0.82)" stroke="rgba(140,190,210,0.2)" />
        {roadSample.map((r) => {
          const [a, b] = [to(r.from[0], r.from[1]), to(r.to[0], r.to[1])];
          return (
            <line
              key={r.id}
              x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
              stroke="rgba(94,200,216,0.35)"
              strokeWidth={r.kind === 'arterial' ? 2 : 1.2}
              strokeLinecap="round"
            />
          );
        })}
        {stops.map((s) => {
          const p = points.find((pt) => pt.id === s.facilityId);
          if (!p) return null;
          const [u, v] = to(p.x, p.z);
          const hit = hits.includes(s.id);
          const next = s.id === nextId;
          return (
            <circle
              key={s.id}
              cx={u}
              cy={v}
              r={next ? 5 : 3.5}
              fill={hit ? '#7dcea0' : next ? '#5ec8d8' : '#4a606c'}
              stroke={next ? '#dff6ff' : 'none'}
              strokeWidth={next ? 1.2 : 0}
            />
          );
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
      <span>Field map</span>
    </div>
  );
}
