import { Check, ClipboardCopy, Download, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import emblem from '../assets/emblem.jpg';
import fieldBg from '../assets/night-tide/backgrounds/moonlit-oilfield.png';
import type { HandoffReport } from '../lib/crew';
import { handoffPlainText } from '../lib/crew';
import { fmt } from '../lib/model';

/** Live handoff card matching the Avon concept layout. */
export function ShiftHandoffCard({ report }: { report: HandoffReport }) {
  const [copied, setCopied] = useState(false);
  const text = handoffPlainText(report);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const stamp = fmt.iso(report.boundaryUnix).replace(/[:]/g, '').slice(0, 15);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shift-handoff-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
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

      <div className="handoff-sec-label">Relief</div>
      <div className="handoff-relief">
        <div className="handoff-col out">
          <div className="handoff-col-label">Outgoing</div>
          {report.outgoing.length === 0 && <p className="handoff-empty">Nobody listed</p>}
          {report.outgoing.map((p, i) => (
            <div key={`out-${p.name}-${p.detail}`} className="handoff-person">
              <span className="handoff-av">{i + 1}</span>
              <span className="handoff-person-text">
                <strong>{p.name}</strong>
                <span> · {p.detail}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="handoff-arrow" aria-hidden>→</div>
        <div className="handoff-col in">
          <div className="handoff-col-label">Incoming</div>
          {report.incoming.length === 0 && <p className="handoff-empty">Nobody listed</p>}
          {report.incoming.map((p, i) => (
            <div key={`in-${p.name}-${p.detail}`} className="handoff-person">
              <span className="handoff-av in">{i + 1}</span>
              <span className="handoff-person-text">
                <strong>{p.name}</strong>
                <span> · {p.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="handoff-sec-label">Do now</div>
      <section className="handoff-box">
        {report.doNow.length === 0 ? (
          <p className="handoff-empty">Nothing urgent. Tanks are cycling normally.</p>
        ) : (
          <ul className="handoff-list">
            {report.doNow.map((d) => (
              <li key={d.eventId}>
                <i className="dot coral" />
                <div>{d.blurb}</div>
              </li>
            ))}
          </ul>
        )}
        {report.fleetChips.length > 0 && (
          <div className="handoff-fleet">{report.fleetChips.join(' · ')}</div>
        )}
      </section>

      <div className="handoff-sec-label">Watch</div>
      <section className="handoff-box">
        {report.watch.length === 0 ? (
          <p className="handoff-empty">No leaks or worn pumps to watch.</p>
        ) : (
          <ul className="handoff-list">
            {report.watch.map((w) => (
              <li key={w.eventId}>
                <i className="dot amber" />
                <div>{w.label}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="handoff-sec-label">Coverage</div>
      <div className="handoff-coverage">
        {report.coverage.length === 0 && (
          <span className="handoff-pill ok">
            <Check size={12} strokeWidth={3} /> All clear
          </span>
        )}
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
        <div className="handoff-share-row">
          <button type="button" className="handoff-copy" onClick={copy}>
            {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="handoff-download" onClick={download}>
            <Download size={16} /> Download
          </button>
        </div>
        <Link to="/alerts" className="handoff-alerts">
          Open alerts →
        </Link>
      </footer>
    </article>
  );
}

/** Popup only. Live coded card, not a screenshot. */
export function HandoffModal({
  report,
  onClose,
}: {
  report: HandoffReport;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="handoff-modal" role="dialog" aria-modal="true" aria-label="Shift handoff">
      <button type="button" className="handoff-modal-scrim" aria-label="Close" onClick={onClose} />
      <div
        className="handoff-modal-scene"
        style={{ backgroundImage: `url(${fieldBg})` }}
        aria-hidden
      />
      <div className="handoff-modal-panel">
        <button type="button" className="handoff-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <ShiftHandoffCard report={report} />
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
