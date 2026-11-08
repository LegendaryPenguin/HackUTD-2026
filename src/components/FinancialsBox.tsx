import { useMemo } from 'react';
import { useStore } from '../state/store';
import { fieldFinancialsAt } from '../lib/financials';
import { fmt } from '../lib/model';

export function FinancialsBox() {
  const { dataset, analysis, now, dispatched } = useStore();
  const fin = useMemo(() => {
    if (!dataset || !analysis) return null;
    return fieldFinancialsAt(dataset, now, analysis.ongoing, dispatched);
  }, [dataset, analysis, now, dispatched]);

  if (!fin) return null;

  return (
    <div className="financials-box">
      <div className="financials-head">
        <span>Financials</span>
        {fin.activePlans > 0 && <span className="chip mint">{fin.activePlans} plan{fin.activePlans > 1 ? 's' : ''} live</span>}
      </div>
      <dl className="financials-kv">
        <dt>Oil online</dt><dd>{fmt.num(fin.oilBpd)} bpd</dd>
        <dt>Gas online</dt><dd>{fmt.num(fin.gasMcfd)} mcfd</dd>
        <dt>Rate</dt><dd>{fmt.money(fin.ratePerHour)}/h</dd>
        <dt>Water in</dt><dd>{fmt.num(fin.waterBpd)} bpd</dd>
        <dt>Cumulative</dt><dd className="financials-cum">{fmt.money(fin.cumulativeProfit)}</dd>
      </dl>
    </div>
  );
}
