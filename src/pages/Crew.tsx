import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import { useStore } from '../state/store';
import { HandoffModal } from '../components/ShiftHandoffCard';
import {
  boundariesInRange,
  buildHandoff,
  coverageAt,
  latestBoundaryAtOrBefore,
  loadCrewState,
  nextBoundaryAfter,
  peopleOnShift,
  ROLE_LABEL,
  saveCrewState,
  shiftEnd,
  shiftKindAt,
  shiftStartContaining,
  type CrewState,
} from '../lib/crew';
import { CATEGORY_LABEL, fmt } from '../lib/model';
export default function Crew() {
  const { dataset, analysis, now, setNow, liveNow } = useStore();

  const systemIds = useMemo(
    () => dataset?.network.systems.map((s) => s.id) ?? [],
    [dataset],
  );
  const t0 = dataset?.telemetry.ts[0] ?? 0;

  const [crew, setCrew] = useState<CrewState | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);

  useEffect(() => {
    if (!dataset) return;
    setCrew(loadCrewState(systemIds, t0, liveNow));
  }, [dataset, systemIds, t0, liveNow]);

  useEffect(() => {
    if (crew) saveCrewState(crew);
  }, [crew]);

  const boundary = useMemo(() => latestBoundaryAtOrBefore(now), [now]);
  const shiftFinish = shiftEnd(boundary);

  const report = useMemo(() => {
    if (!dataset || !analysis || !crew) return null;
    return buildHandoff(dataset, analysis, crew, boundary);
  }, [dataset, analysis, crew, boundary]);

  const whoIncoming = useMemo(() => {
    if (!crew) return [];
    return peopleOnShift(crew, boundary + 60);
  }, [crew, boundary]);

  const whoOutgoing = useMemo(() => {
    if (!crew) return [];
    const prev = shiftStartContaining(boundary - 60);
    return peopleOnShift(crew, prev + 60);
  }, [crew, boundary]);

  const coverage = useMemo(() => {
    if (!dataset || !crew) return [];
    return coverageAt(crew, dataset, analysis, boundary + 60);
  }, [dataset, crew, analysis, boundary]);

  const handoffStops = useMemo(() => {
    if (!dataset) return [] as number[];
    return boundariesInRange(t0, liveNow);
  }, [dataset, t0, liveNow]);

  const shiftProblems = useMemo(() => {
    if (!analysis) return [];
    return analysis.events
      .filter((e) => {
        const end = e.end ?? liveNow;
        return e.onset < shiftFinish && end > boundary;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'ongoing' ? -1 : 1;
        return b.onset - a.onset;
      })
      .slice(0, 8);
  }, [analysis, boundary, shiftFinish, liveNow]);

  if (!dataset || !crew || !report || !analysis) return null;

  const goPrev = () => setNow(Math.max(t0, shiftStartContaining(boundary - 60)));
  const goNext = () => setNow(Math.min(liveNow, nextBoundaryAfter(boundary)));
  const canPrev = boundary > t0;
  const canNext = nextBoundaryAfter(boundary) <= liveNow;
  const kind = shiftKindAt(boundary + 60);

  const swapConsole = () => {
    const start = boundary;
    const consoles = crew.people.filter((p) => p.role === 'console');
    if (consoles.length < 2) return;
    const on = crew.assignments.find(
      (a) => a.startUnix === start && consoles.some((c) => c.id === a.personId),
    );
    const currentId = on?.personId ?? consoles[0].id;
    const next = consoles.find((c) => c.id !== currentId) ?? consoles[0];
    const rest = crew.assignments.filter(
      (a) => !(a.startUnix === start && consoles.some((c) => c.id === a.personId)),
    );
    setCrew({
      ...crew,
      assignments: [
        ...rest,
        {
          id: `${next.id}-${start}`,
          personId: next.id,
          startUnix: start,
          kind: shiftKindAt(start + 60),
          systems: [...next.systems],
        },
      ],
    });
  };

  return (
    <div className="page crew-page">
      <div className="crew-stage">
        <header className="crew-top">
          <div>
            <h1 className="crew-simple-title">Shifts</h1>
            <p className="crew-simple-sub">
              Who is on, what happened this block, and the handoff for this switch.
            </p>
          </div>
          <div className="crew-switcher">
            <button type="button" className="btn sm" disabled={!canPrev} onClick={goPrev}>
              <ChevronLeft size={16} /> Earlier
            </button>
            <button type="button" className="btn sm" disabled={!canNext} onClick={goNext}>
              Later <ChevronRight size={16} />
            </button>
            <button type="button" className="btn primary sm" onClick={() => setHandoffOpen(true)}>
              Open handoff
            </button>
          </div>
        </header>

        <div className="crew-rail">
          {handoffStops.map((b) => {
            const k = shiftKindAt(b + 60);
            const on = b === boundary;
            return (
              <button
                key={b}
                type="button"
                className={`crew-rail-chip ${on ? 'on' : ''} ${k}`}
                onClick={() => setNow(Math.min(liveNow, b))}
              >
                <span className="crew-rail-kind">{k === 'day' ? 'Day' : 'Night'}</span>
                <span className="crew-rail-when">{shortWhen(b)}</span>
              </button>
            );
          })}
        </div>

        <div className="crew-grid crew-grid-3">
          <section className="crew-panel">
            <h2 className="crew-panel-title">
              <Clock size={15} /> This switch
            </h2>
            <p className="crew-panel-lead">
              {kind === 'day' ? 'Day' : 'Night'} crew · {fmt.time(boundary)} to {fmt.time(shiftFinish)} UTC
            </p>
            <div className="crew-split-who">
              <div>
                <div className="crew-mini-label">Leaving</div>
                <WhoList rows={whoOutgoing} empty="None listed" />
              </div>
              <div>
                <div className="crew-mini-label">Taking over</div>
                <WhoList rows={whoIncoming} empty="None listed" />
              </div>
            </div>
            <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={swapConsole}>
              <Users size={14} /> Swap console person
            </button>
          </section>

          <section className="crew-panel">
            <h2 className="crew-panel-title">
              <Users size={15} /> Coverage
            </h2>
            <div className="crew-coverage-list">
              {coverage.length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>No special staffing needs right now.</p>
              )}
              {coverage.map((c) => (
                <div key={c.message} className={`crew-cov ${c.severity}`}>{c.message}</div>
              ))}
            </div>
          </section>

          <section className="crew-panel">
            <h2 className="crew-panel-title">
              <Bell size={15} /> During this shift
            </h2>
            {shiftProblems.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Quiet block. No detected problems in this window.</p>
            ) : (
              <ul className="crew-prob-list">
                {shiftProblems.map((e) => (
                  <li key={e.id}>
                    <span className={`crew-prob-dot ${e.category}`} />
                    <div>
                      <Link
                        to={e.category === 'pump_failure' ? `/plan/${encodeURIComponent(e.id)}` : '/alerts'}
                        className="crew-prob-link"
                      >
                        {CATEGORY_LABEL[e.category]} · {fmt.short(e.facility)}
                      </Link>
                      <div className="dim" style={{ fontSize: 11 }}>
                        {e.status === 'ongoing' ? 'Still open' : 'Resolved'} · since {fmt.time(e.onset)}
                        {e.end ? ` · ended ${fmt.time(e.end)}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="crew-panel-actions">
              <Link to="/alerts" className="btn primary sm">Open alerts</Link>
              <Link to="/" className="btn ghost sm"><MapPin size={13} /> Map</Link>
            </div>
          </section>
        </div>
      </div>

      {handoffOpen && (
        <HandoffModal report={report} onClose={() => setHandoffOpen(false)} />
      )}
    </div>
  );
}

function WhoList({
  rows,
  empty,
}: {
  rows: ReturnType<typeof peopleOnShift>;
  empty: string;
}) {
  if (!rows.length) return <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{empty}</p>;
  return (
    <ul className="crew-who-compact">
      {rows.map(({ person, assignment }) => (
        <li key={assignment.id}>
          <strong>{person.name}</strong>
          <span>
            {ROLE_LABEL[person.role]}
            {person.role !== 'console' && assignment.systems[0] ? ` · ${assignment.systems[0]}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function shortWhen(unix: number): string {
  const d = new Date(unix * 1000);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return `${day} ${h}${ampm}`;
}
