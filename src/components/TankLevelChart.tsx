import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmt } from '../lib/model';

type Point = { t: number; level: number; bbl: number };

type ZoomState = {
  left: number | 'dataMin';
  right: number | 'dataMax';
  refLeft?: number;
  refRight?: number;
};

const INITIAL: ZoomState = { left: 'dataMin', right: 'dataMax' };

/** Downsample so the card stays smooth on a full week of 5-min telemetry. */
function downsample(pts: Point[], maxPoints: number): Point[] {
  if (pts.length <= maxPoints) return pts;
  const out: Point[] = [];
  const step = (pts.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  return out;
}

function dayTime(unix: number) {
  return fmt.dayTime(unix);
}

/**
 * Enchantress-style tank level chart: full series, drag to zoom a window,
 * stats for start / end / avg fill rate in that window.
 */
export function TankLevelChart({
  timestamps,
  levels,
  capacityBbl,
  warnPct = 85,
  shutPct = 92,
  endIdx,
  height = 168,
  tone = 'ok',
}: {
  timestamps: Int32Array | number[];
  levels: Float32Array | number[];
  capacityBbl: number;
  warnPct?: number;
  shutPct?: number;
  /** Inclusive last index to include (usually indexAt(now)). */
  endIdx: number;
  height?: number;
  tone?: 'ok' | 'warn' | 'fault';
}) {
  const [zoom, setZoom] = useState<ZoomState>(INITIAL);

  const chartData = useMemo(() => {
    const n = Math.min(timestamps.length, levels.length, endIdx + 1);
    if (n < 2) return [] as Point[];
    const raw: Point[] = [];
    // Keep density manageable; prefer every Nth when huge.
    const stride = n > 2500 ? Math.ceil(n / 900) : n > 1200 ? Math.ceil(n / 700) : 1;
    for (let i = 0; i < n; i += stride) {
      const level = Number(levels[i]);
      if (!Number.isFinite(level)) continue;
      raw.push({
        t: Number(timestamps[i]),
        level,
        bbl: (level / 100) * capacityBbl,
      });
    }
    // Always include the last sample.
    const lastI = n - 1;
    const last = Number(levels[lastI]);
    if (Number.isFinite(last) && (raw.length === 0 || raw[raw.length - 1].t !== Number(timestamps[lastI]))) {
      raw.push({ t: Number(timestamps[lastI]), level: last, bbl: (last / 100) * capacityBbl });
    }
    return downsample(raw, 720);
  }, [timestamps, levels, capacityBbl, endIdx]);

  const windowPts = useMemo(() => {
    if (chartData.length === 0) return [] as Point[];
    const lo = zoom.left === 'dataMin' ? chartData[0].t : zoom.left;
    const hi = zoom.right === 'dataMax' ? chartData[chartData.length - 1].t : zoom.right;
    return chartData.filter((d) => d.t >= lo && d.t <= hi);
  }, [chartData, zoom.left, zoom.right]);

  const stats = useMemo(() => {
    if (windowPts.length < 2) {
      const p = windowPts[0];
      return {
        start: p?.level ?? null,
        end: p?.level ?? null,
        startBbl: p?.bbl ?? null,
        endBbl: p?.bbl ?? null,
        startT: p?.t ?? null,
        endT: p?.t ?? null,
        avgPctPerHour: null as number | null,
      };
    }
    const a = windowPts[0];
    const b = windowPts[windowPts.length - 1];
    const hours = Math.max(1 / 60, (b.t - a.t) / 3600);
    return {
      start: a.level,
      end: b.level,
      startBbl: a.bbl,
      endBbl: b.bbl,
      startT: a.t,
      endT: b.t,
      avgPctPerHour: (b.level - a.level) / hours,
    };
  }, [windowPts]);

  const yDomain = useMemo((): [number, number] => {
    if (windowPts.length === 0) return [0, 100];
    let lo = Math.min(...windowPts.map((p) => p.level));
    let hi = Math.max(...windowPts.map((p) => p.level));
    lo = Math.max(0, Math.floor(lo) - 4);
    hi = Math.min(100, Math.ceil(hi) + 4);
    if (hi - lo < 12) {
      const mid = (lo + hi) / 2;
      lo = Math.max(0, mid - 6);
      hi = Math.min(100, mid + 6);
    }
    return [lo, Math.max(hi, shutPct + 1)];
  }, [windowPts, shutPct]);

  const stroke = tone === 'fault' ? '#f08a9a' : tone === 'warn' ? '#e0a84a' : '#5ec8d8';
  const zoomed = zoom.left !== 'dataMin' || zoom.right !== 'dataMax';

  const applyZoom = useCallback(() => {
    setZoom((prev) => {
      let { refLeft, refRight } = prev;
      if (refLeft == null || refRight == null || refLeft === refRight) {
        return { ...prev, refLeft: undefined, refRight: undefined };
      }
      if (refLeft > refRight) [refLeft, refRight] = [refRight, refLeft];
      return { left: refLeft, right: refRight, refLeft: undefined, refRight: undefined };
    });
  }, []);

  if (chartData.length < 2) {
    return <div className="tank-level-chart__empty">No tank level history for this window.</div>;
  }

  return (
    <div className={`tank-level-chart tone-${tone}`}>
      <div className="tank-level-chart__stats">
        <div>
          <div className="tank-level-chart__k">Range</div>
          <b>
            {stats.startT != null ? dayTime(stats.startT) : '-'}
            <span className="tank-level-chart__to"> to </span>
            {stats.endT != null ? dayTime(stats.endT) : '-'}
          </b>
        </div>
        <div>
          <div className="tank-level-chart__k">Avg fill rate</div>
          <b>
            {stats.avgPctPerHour == null
              ? '-'
              : `${stats.avgPctPerHour >= 0 ? '+' : ''}${stats.avgPctPerHour.toFixed(2)} %/h`}
          </b>
        </div>
        <div>
          <div className="tank-level-chart__k">Start volume</div>
          <b>
            {stats.start == null ? '-' : `${stats.start.toFixed(1)}%`}
            <span className="tank-level-chart__sub">
              {stats.startBbl == null ? '' : ` · ${fmt.num(stats.startBbl)} bbl`}
            </span>
          </b>
        </div>
        <div>
          <div className="tank-level-chart__k">End volume</div>
          <b>
            {stats.end == null ? '-' : `${stats.end.toFixed(1)}%`}
            <span className="tank-level-chart__sub">
              {stats.endBbl == null ? '' : ` · ${fmt.num(stats.endBbl)} bbl`}
            </span>
          </b>
        </div>
      </div>

      <div className="tank-level-chart__toolbar">
        <span className="tank-level-chart__title">Tank level · drag to zoom a period</span>
        {zoomed && (
          <button type="button" className="btn ghost sm" onClick={() => setZoom(INITIAL)}>
            Zoom out
          </button>
        )}
      </div>

      <div className="tank-level-chart__plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 10, left: 0, bottom: 4 }}
            onMouseDown={(e) => {
              if (e?.activeLabel != null) {
                setZoom((z) => ({ ...z, refLeft: Number(e.activeLabel), refRight: undefined }));
              }
            }}
            onMouseMove={(e) => {
              if (e?.activeLabel != null) {
                setZoom((z) => (z.refLeft != null ? { ...z, refRight: Number(e.activeLabel) } : z));
              }
            }}
            onMouseUp={applyZoom}
          >
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[zoom.left, zoom.right]}
              allowDataOverflow
              tickFormatter={(t) => dayTime(Number(t))}
              stroke="rgba(186, 210, 228, 0.45)"
              fontSize={10}
              minTickGap={36}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              unit="%"
              stroke="rgba(186, 210, 228, 0.45)"
              fontSize={10}
              width={36}
              tickCount={5}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                background: 'rgba(12, 24, 36, 0.96)',
                border: '1px solid rgba(148, 184, 220, 0.28)',
                borderRadius: 10,
              }}
              labelFormatter={(t) => dayTime(Number(t))}
              formatter={(v, _n, item) => {
                const bbl = (item?.payload as Point | undefined)?.bbl;
                const pct = Number(v ?? 0).toFixed(1);
                return [
                  bbl != null ? `${pct}% · ${fmt.num(bbl)} bbl` : `${pct}%`,
                  'Tank level',
                ];
              }}
            />
            <ReferenceLine y={warnPct} stroke="rgba(224,168,74,0.55)" strokeDasharray="4 4" />
            <ReferenceLine
              y={shutPct}
              stroke="rgba(240,138,154,0.7)"
              strokeDasharray="4 4"
              label={{ value: '92%', fill: '#f08a9a', fontSize: 10, position: 'insideTopLeft' }}
            />
            <Line
              type="monotone"
              dataKey="level"
              stroke={stroke}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, fill: stroke }}
            />
            {zoom.refLeft != null && zoom.refRight != null && (
              <ReferenceArea
                x1={zoom.refLeft}
                x2={zoom.refRight}
                strokeOpacity={0.25}
                fill={stroke}
                fillOpacity={0.14}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
