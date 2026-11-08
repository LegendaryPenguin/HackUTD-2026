import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Clock, Gauge, MapPin, Play, RotateCcw,
  Sparkles, Timer, Trophy, Truck,
} from 'lucide-react';
import { useStore } from '../state/store';
import { buildDrivePoints } from '../lib/driveMap';
import {
  COACH_STORAGE_KEY, gradeRun, missionFromFailure, practiceMissions, type DriveMission,
} from '../lib/driveMission';
import { fmt } from '../lib/model';
import { DriveScene, type DriveTelemetry } from '../components/drive/DriveScene';
import { buildCoachSteps, DriveCoachPanel, type CoachAllow, type CoachStep } from '../components/drive/DriveCoach';

type Flow = 'select' | 'brief' | 'coach' | 'run' | 'finish';

const emptyTelem: DriveTelemetry = {
  speed: 0, dist: 0, heading: 0, bearing: 0, aligned: false, x: 0, z: 0, steered: false,
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
  const [best, setBest] = useState<Record<string, number>>({});
  const [resetKey, setResetKey] = useState(0);
  const [telem, setTelem] = useState<DriveTelemetry>(emptyTelem);
  const [coachIdx, setCoachIdx] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const flowRef = useRef<Flow>('select');
  const celebrateLock = useRef(false);
  flowRef.current = flow;

  const map = useMemo(() => {
    if (!dataset || !mission) return null;
    return buildDrivePoints(dataset, mission.systemId);
  }, [dataset, mission]);

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
    if (step.id === 'go') {
      writeCoachSeen();
      beginRun();
      return;
    }
    if (coachIdx >= steps.length - 1) {
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
    if (flowRef.current !== 'coach' || !step || step.mode !== 'practice' || celebrating) return;
    if (step.check?.(t)) succeedStep();
  };

  const beginRun = () => {
    setFlow('run');
    setElapsed(0);
    startRef.current = performance.now();
    setResetKey((k) => k + 1);
  };

  const pickMission = (m: DriveMission) => {
    setMission(m);
    setFlow('brief');
    setElapsed(0);
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

  const onArrive = () => {
    if (flowRef.current !== 'run' && flowRef.current !== 'coach') return;
    // only grade during live run
    if (flowRef.current === 'coach') return;
    const sec = startRef.current != null ? (performance.now() - startRef.current) / 1000 : elapsed;
    setElapsed(sec);
    setFlow('finish');
    if (mission) {
      setBest((b) => {
        const prev = b[mission.id];
        if (prev == null || sec < prev) return { ...b, [mission.id]: sec };
        return b;
      });
    }
  };

  const restartRun = () => {
    setFlow('run');
    setElapsed(0);
    startRef.current = performance.now();
    setResetKey((k) => k + 1);
  };

  const backToSelect = () => {
    setFlow('select');
    setMission(null);
    setElapsed(0);
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

  const needle = ((telem.bearing - telem.heading) * 180) / Math.PI;
  const targetPoint = map?.points.find((p) => p.id === mission?.facilityId) ?? null;
  const g = mission ? gradeRun(elapsed, mission.difficulty.timeLimitSec) : null;
  const over = mission ? elapsed > mission.difficulty.timeLimitSec : false;

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
        />
      )}

      {flow === 'select' && (
        <div className="drive-select">
          <div className="drive-select-inner">
            <p className="drive-eyebrow">Night Tide · truck school</p>
            <h1>Pick a haul that needs a truck.</h1>
            <p className="drive-lead">
              {failureMissions.length > 0
                ? 'These pump failures are filling tanks. Difficulty follows tank level, time-to-trip, and response distance.'
                : 'No active pump failures right now — run a practice pad to learn the yard → tank path.'}
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
            <p className="drive-lead">Your budget of time and fog comes from live ops conditions — same idea as the HackKU minigame briefings.</p>

            <div className="drive-brief-grid">
              <div className="drive-brief-card">
                <p className="drive-brief-label"><AlertTriangle size={14} /> Why this pad</p>
                <ul>
                  {mission.difficulty.why.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
              <div className="drive-brief-card">
                <p className="drive-brief-label"><Sparkles size={14} /> What changes in the run</p>
                <ul>
                  {mission.difficulty.stakes.map((s) => <li key={s}>{s}</li>)}
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
                  : `Training clock ${mission.difficulty.timeLimitSec}s · ${mission.subtitle}`}
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
                <div className="drive-stat">
                  <MapPin size={14} />
                  <span>{telem.dist.toFixed(0)} u</span>
                </div>
                {best[mission.id] != null && (
                  <div className="drive-stat best">
                    <Trophy size={14} />
                    <span>{best[mission.id].toFixed(1)}s best</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="drive-compass" aria-hidden>
            <div className="drive-compass-ring">
              <i style={{ transform: `rotate(${needle}deg)` }} />
            </div>
            <span>Target</span>
          </div>

          {flow === 'run' && (
            <div className="drive-hud bottom">
              <div className="drive-keys">
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                <span>drive into the aqua ring</span>
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

      {flow === 'finish' && mission && g && (
        <div className="drive-finish">
          <div className="drive-finish-card">
            <span className={`chip ${g.tone}`}>{g.label}</span>
            <h2>Arrived · {mission.tankLabel}</h2>
            <p className="drive-finish-time">{elapsed.toFixed(2)}s</p>
            <p className="muted">
              <Clock size={12} style={{ verticalAlign: -2 }} /> Window was {mission.difficulty.timeLimitSec}s
              {best[mission.id] != null && best[mission.id] <= elapsed + 0.01
                ? ' · personal best'
                : best[mission.id] != null
                  ? ` · best ${best[mission.id].toFixed(2)}s`
                  : ''}
            </p>
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
