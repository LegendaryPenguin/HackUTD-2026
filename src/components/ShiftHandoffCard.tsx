import { Check, ClipboardCopy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import emblem from '../assets/emblem.jpg';
import type { HandoffReport } from '../lib/crew';
import { handoffPlainText } from '../lib/crew';

/** Visual handoff report matching the Avon concept card. Always "open" as the page hero. */
export function ShiftHandoffCard({ report }: { report: HandoffReport }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(handoffPlainText(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const from = cap(report.fromKind);
  const to = cap(report.toKind);
  const when = friendlyWhen(report.boundaryUnix);

  return (
    <article className="handoff-card" aria-label="Shift handoff report">
      <header className="handoff-head">
        <div className="handoff-brand">
          <img src={emblem} alt="" />
          <span>Avon · Night Tide</span>
        </div>
        <h1 className="handoff-title">Shift handoff</h1>
        <p className="handoff-meta">{when} · {from} → {to}</p>
        <p className="handoff-lead">{report.lead}</p>
      </header>

      <div className="handoff-relief">
        <div className="handoff-col out">
          <div className="handoff-col-label">Outgoing</div>
          {report.outgoing.length === 0 && <p className="handoff-empty">Nobody listed</p>}
          {report.outgoing.map((p) => (
            <div key={`out-${p.name}-${p.detail}`} className="handoff-person">
              <span className="handoff-av">{initials(p.name)}</span>
              <span className="handoff-person-text">
                <strong>{p.name}</strong>
                <span>· {p.detail}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="handoff-arrow" aria-hidden>→</div>
        <div className="handoff-col in">
          <div className="handoff-col-label">Incoming</div>
          {report.incoming.length === 0 && <p className="handoff-empty">Nobody listed</p>}
          {report.incoming.map((p) => (
            <div key={`in-${p.name}-${p.detail}`} className="handoff-person">
              <span className="handoff-av in">{initials(p.name)}</span>
              <span className="handoff-person-text">
                <strong>{p.name}</strong>
                <span>· {p.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="handoff-box">
        <div className="handoff-sec-label">Do now</div>
        {report.doNow.length === 0 ? (
          <p className="handoff-empty">Nothing urgent. Tanks are cycling normally.</p>
        ) : (
          <ul className="handoff-list">
            {report.doNow.map((d) => (
              <li key={d.eventId}>
                <i className="dot coral" />
                <div>
                  <Link to={`/plan/${encodeURIComponent(d.eventId)}`} className="handoff-link">{d.blurb}</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {report.fleetChips.length > 0 && (
          <div className="handoff-fleet">{report.fleetChips.join(' · ')}</div>
        )}
      </section>

      <section className="handoff-box">
        <div className="handoff-sec-label">Watch</div>
        {report.watch.length === 0 ? (
          <p className="handoff-empty">No leaks or worn pumps to watch.</p>
        ) : (
          <ul className="handoff-list">
            {report.watch.map((w) => (
              <li key={w.eventId}>
                <i className="dot amber" />
                <div>
                  <Link to="/alerts" className="handoff-link muted-link">{w.label}</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="handoff-coverage">
        {report.coverage.map((c) => (
          <span
            key={c.message}
            className={`handoff-pill ${c.severity === 'ok' ? 'ok' : c.severity === 'bad' ? 'bad' : 'warn'}`}
          >
            {c.severity === 'ok' ? <Check size={12} strokeWidth={3} /> : null}
            {c.message}
          </span>
        ))}
      </div>

      <footer className="handoff-foot">
        <button type="button" className="handoff-copy" onClick={copy}>
          {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
          {copied ? 'Copied' : 'Copy handoff'}
        </button>
        <Link to="/alerts" className="handoff-alerts">
          Open alerts →
        </Link>
      </footer>
    </article>
  );
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sat Oct 10 · 6:00 PM */
function friendlyWhen(unix: number): string {
  const d = new Date(unix * 1000);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  let h = d.getUTCHours();
  const min = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(min).padStart(2, '0');
  return `${day} ${mon} ${d.getUTCDate()} · ${h}:${mm} ${ampm}`;
}
