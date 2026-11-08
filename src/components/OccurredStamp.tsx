import { fmt } from '../lib/model';

/** Large day + clock stamp so onset is obvious on alert / shift cards. */
export function OccurredStamp({
  unix,
  label = 'Occurred',
  compact,
}: {
  unix: number;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`occurred-stamp${compact ? ' is-compact' : ''}`} title={`${fmt.date(unix)} · ${fmt.clock(unix)} UTC`}>
      <span className="occurred-stamp__label">{label}</span>
      <span className="occurred-stamp__day">{fmt.occurredDay(unix)}</span>
      <span className="occurred-stamp__time">{fmt.clock(unix)}</span>
      <span className="occurred-stamp__tz">UTC</span>
    </div>
  );
}
