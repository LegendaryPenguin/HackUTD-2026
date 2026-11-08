import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../state/store';
import { ShiftHandoffCard } from '../components/ShiftHandoffCard';
import {
  buildHandoff,
  latestBoundaryAtOrBefore,
  loadCrewState,
  nextBoundaryAfter,
  peopleOnShift,
  ROLE_LABEL,
  saveCrewState,
  shiftKindAt,
  shiftStartContaining,
  type CrewState,
} from '../lib/crew';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';

/**
 * Shifts page for a random operator: one handoff report they can read in 30 seconds.
 * Schedule editing stays behind a simple toggle.
 */
export default function Crew() {
  const { dataset, analysis, now, setNow, liveNow } = useStore();

  const systemIds = useMemo(
    () => dataset?.network.systems.map((s) => s.id) ?? [],
    [dataset],
  );
  const t0 = dataset?.telemetry.ts[0] ?? 0;

  const [crew, setCrew] = useState<CrewState | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!dataset) return;
    setCrew(loadCrewState(systemIds, t0, liveNow));
  }, [dataset, systemIds, t0, liveNow]);

  useEffect(() => {
    if (crew) saveCrewState(crew);
  }, [crew]);

  const boundary = useMemo(() => latestBoundaryAtOrBefore(now), [now]);

  const report = useMemo(() => {
    if (!dataset || !analysis || !crew) return null;
    return buildHandoff(dataset, analysis, crew, boundary);
  }, [dataset, analysis, crew, boundary]);

  const whoIncoming = useMemo(() => {
    if (!crew) return [];
    return peopleOnShift(crew, boundary + 60);
  }, [crew, boundary]);

  if (!dataset || !crew || !report) return null;

  const goPrev = () => {
    const prev = shiftStartContaining(boundary - 60);
    setNow(Math.max(t0, prev));
  };
  const goNext = () => {
    const n = nextBoundaryAfter(boundary);
    setNow(Math.min(liveNow, n));
  };
  const canPrev = boundary > t0;
  const canNext = nextBoundaryAfter(boundary) <= liveNow;

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
      <div className="crew-stage" style={{ backgroundImage: `url(${fieldBg})` }}>
        <div className="crew-stage-veil" />

        <div className="crew-toolbar">
          <div>
            <h1 className="crew-simple-title">Shifts</h1>
            <p className="crew-simple-sub">
              Read this before you take the desk. Scrub the timeline, or step switch by switch.
            </p>
          </div>
          <div className="crew-switcher">
            <button type="button" className="btn sm" disabled={!canPrev} onClick={goPrev} aria-label="Previous switch">
              <ChevronLeft size={16} /> Earlier
            </button>
            <button type="button" className="btn sm" disabled={!canNext} onClick={goNext} aria-label="Next switch">
              Later <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="crew-card-wrap">
          <ShiftHandoffCard report={report} />
        </div>

        <details className="crew-edit" open={editOpen} onToggle={(e) => setEditOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Who is on this shift?</summary>
          <div className="crew-edit-body">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Incoming crew for this handoff. Change console if the wrong person is listed.
            </p>
            <ul className="crew-who">
              {whoIncoming.length === 0 && <li className="muted">No one assigned yet.</li>}
              {whoIncoming.map(({ person, assignment }) => (
                <li key={assignment.id}>
                  <strong>{person.name}</strong>
                  <span className="muted">
                    {' '}
                    · {ROLE_LABEL[person.role]}
                    {assignment.systems[0] ? ` · ${assignment.systems[0]}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="crew-edit-actions">
              <button type="button" className="btn sm" onClick={swapConsole}>
                Swap console person
              </button>
              <Link to="/alerts" className="btn primary sm">Go fix problems</Link>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
