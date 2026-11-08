import { useMemo } from 'react';
import { useStore } from '../state/store';
import { fieldFinancialsAt } from '../lib/financials';
import { fmt } from '../lib/model';
import { buildDispatchedPlan } from '../lib/dispatch';
import { failureContext } from '../lib/planner';

export function FinancialsBox() {
  const { dataset, analysis, now, dispatched, simulating } = useStore();
  const fin = useMemo(() => {
    if (!dataset || !analysis) return null;
    const overlay = { ...dispatched };
    if (simulating) {
      const ev = analysis.events.find((e) => e.id === simulating.eventId);
      if (ev) {
        const ctx = failureContext(ev, dataset, simulating.onsetUnix);
        overlay[simulating.eventId] = buildDispatchedPlan(ctx, dataset, simulating.plan, simulating.onsetUnix);
      }
    }
    return fieldFinancialsAt(dataset, now, analysis.ongoing, overlay);
  }, [dataset, analysis, now, dispatched, simulating]);

  if (!fin) return null;

  return (
    <div className="financials-box">
      <div className="financials-head">
        <span>Financials</span>
        {!simulating && fin.activePlans > 0 && <span className="chip mint">{fin.activePlans} plan{fin.activePlans > 1 ? 's' : ''} live</span>}
      </div>
      <dl className="financials-kv">
        <dt>Oil online</dt><dd>{fmt.num(fin.oilBpd)} bpd</dd>
        <dt>Gas online</dt><dd>{fmt.num(fin.gasMcfd)} mcfd</dd>
        <dt>Rate</dt><dd>{fmt.money(fin.ratePerHour)}/h</dd>
        <dt>Water in</dt><dd>{fmt.num(fin.waterBpd)} bpd</dd>
        <dt>Cumulative</dt><dd className="financials-cum">{fmt.money(fin.cumulativeProfit)}</dd>
      </dl>
      {simulating && (
        <div className="chip aqua" style={{ marginTop: 8 }}>
          Simulating · {simulating.plan.label}
        </div>
      )}
    </div>
  );
}
