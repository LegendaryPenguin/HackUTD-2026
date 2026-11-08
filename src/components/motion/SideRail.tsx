import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGroup,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  Activity,
  Bell,
  ChevronDown,
  FolderOpen,
  Fuel,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Timer,
  Truck,
  Users,
} from 'lucide-react';
import { useStore } from '../../state/store';
import { fmt } from '../../lib/model';
import './side-rail.css';

type RailLink = {
  to: string;
  end?: boolean;
  label: string;
  short: string;
  sub: string;
  icon: typeof MapIcon;
  badge?: number;
};

/** Map-first ops rail — closed by default; opens with parallax on the field map. */
export function SideRail({
  alertCount,
  systems,
  open,
  onOpenChange,
}: {
  alertCount: number;
  systems?: number;
  facilities?: number;
  readings?: number;
  sensors?: number;
  rangeLabel?: string;
  eventTicks?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const mouseY = useMotionValue(-9999);
  const fileRef = useRef<HTMLInputElement>(null);
  const { analysis, datasets, dataset, load, loadFiles, loading, error, liveNow } = useStore();
  const hottest = analysis?.orderedFailures[0];
  const plan = hottest ? analysis?.systemPlans[hottest.facility.system]?.plans[hottest.event.id] : undefined;

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.toggle('is-rail-open', open);
    shell?.classList.toggle('is-rail-closed', !open);
    return () => {
      shell?.classList.remove('is-rail-open', 'is-rail-closed');
    };
  }, [open]);

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--rail-x', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--rail-y', `${((e.clientY - r.top) / r.height) * 100}%`);
    if (reduce || !open) return;
    mouseY.set(e.clientY);
  };
  const onLeave = () => mouseY.set(-9999);

  const operate: RailLink[] = [
    { to: '/', end: true, label: 'Field map', short: 'Map', sub: 'Basin live', icon: MapIcon },
    { to: '/alerts', label: 'Alerts', short: 'Alerts', sub: 'Needs you', icon: Bell, badge: alertCount > 0 ? alertCount : undefined },
    { to: '/plan', label: 'Plan', short: 'Plan', sub: 'Cost paths', icon: SlidersHorizontal },
    { to: '/crew', label: 'Shifts', short: 'Shifts', sub: 'Handoff', icon: Users },
    { to: '/drive', label: 'Drive', short: 'Drive', sub: 'Truck run', icon: Truck },
  ];

  const review: RailLink[] = [
    { to: '/trends', label: 'Trends', short: 'Trends', sub: 'Sensor tape', icon: Activity },
    { to: '/tycoon', label: 'Oil Tycoon', short: 'Tycoon', sub: 'Field play', icon: Fuel },
  ];

  const hot = alertCount > 0;
  const htl = hottest && isFinite(hottest.hoursToLimit) ? hottest.hoursToLimit : null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="rail-fab"
          aria-label="Open navigation"
          onClick={() => onOpenChange(true)}
        >
          <PanelLeftOpen size={16} />
          <span>Menu</span>
          {alertCount > 0 && <i className="rail-fab-badge">{alertCount}</i>}
        </button>
      )}

      <nav
        className={`side-rail${open ? ' is-open' : ' is-closed'}`}
        aria-label="Primary"
        aria-hidden={!open}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        <div className="side-rail-inner">
          <div className="rail-toolbar">
            <span className="rail-toolbar-label">Navigate</span>
            <button
              type="button"
              className="rail-toggle"
              aria-label="Close navigation"
              onClick={() => onOpenChange(false)}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>

          <div className="rail-dataset">
            <div className="rail-group-label">Dataset</div>
            <div className="rail-select" title="Dataset folder (data/<folder>)">
              <select value={dataset?.name ?? ''} onChange={(e) => load(e.target.value)} disabled={!!loading}>
                {dataset && !datasets.includes(dataset.name) && <option value={dataset.name}>{dataset.name}</option>}
                {datasets.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
            <button
              type="button"
              className="rail-folder-btn"
              onClick={() => fileRef.current?.click()}
              title="Open a folder with network.json, ops.json, telemetry.csv"
            >
              <FolderOpen size={14} /> Open folder
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              multiple
              onChange={(e) => e.target.files && loadFiles(e.target.files)}
            />
            {error && <span className="chip coral" style={{ width: '100%', justifyContent: 'center' }}>{error}</span>}
            {dataset && (
              <span className="rail-live" title={fmt.dayTime(liveNow)}>
                <i className="dot live" /> LIVE END · {fmt.dayTime(liveNow)}
              </span>
            )}
          </div>

          <div className="rail-nav">
            <LayoutGroup id="avon-rail">
              <div className="rail-group">
                <div className="rail-group-label">Operate</div>
                {operate.map((item) => (
                  <RailItem
                    key={item.to}
                    item={item}
                    reduce={!!reduce}
                    mouseY={mouseY}
                    onNavigate={() => {
                      // Field map is map-first — close the drawer when entering it
                      if (item.to === '/' || item.to === '/network') onOpenChange(false);
                    }}
                  />
                ))}
              </div>

              <div className="rail-group">
                <div className="rail-group-label">Review</div>
                {review.map((item) => (
                  <RailItem key={item.to} item={item} reduce={!!reduce} mouseY={mouseY} />
                ))}
              </div>
            </LayoutGroup>
          </div>

          <div className={`rail-watch${hot ? ' is-hot' : ''}`}>
            <div className="rail-watch-head">
              <strong>{hottest ? 'Hottest clock' : 'All quiet'}</strong>
              <span className={`rail-pulse ${hot ? 'is-alert' : ''}`} aria-hidden />
            </div>

            {hottest && htl != null ? (
              <NavLink
                to={`/?f=${hottest.facility.id}&flow=decide`}
                className="rail-watch-hero"
                onClick={() => onOpenChange(false)}
              >
                <div className="rail-watch-eta">
                  <Timer size={15} strokeWidth={2} />
                  <em>{fmt.dur(htl)}</em>
                </div>
                <div className="rail-watch-copy">
                  <strong>{fmt.short(hottest.facility.id)}</strong>
                  <span>{plan?.label ?? 'Open map plan'}</span>
                </div>
              </NavLink>
            ) : (
              <div className="rail-watch-idle">
                {systems != null ? 'No filling tanks.' : 'Load a dataset.'}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

function RailItem({
  item,
  reduce,
  mouseY,
  onNavigate,
}: {
  item: RailLink;
  reduce: boolean;
  mouseY: MotionValue<number>;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const ref = useRef<HTMLAnchorElement>(null);
  const distance = useTransform(mouseY, (y) => {
    const node = ref.current;
    if (!node || y < -1000) return 140;
    const r = node.getBoundingClientRect();
    return y - (r.top + r.height / 2);
  });
  const scaleRaw = useTransform(distance, [-90, 0, 90], [1, 1.12, 1]);
  const scale = useSpring(scaleRaw, { mass: 0.14, stiffness: 280, damping: 20 });

  return (
    <NavLink
      ref={ref}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `rail-link ${isActive ? 'is-active' : ''}`}
      onClick={onNavigate}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              className="rail-link-bg"
              layoutId={reduce ? undefined : 'rail-active'}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 36 }}
            />
          )}
          <span className="rail-link-accent" aria-hidden />
          <motion.span className="rail-link-icon" style={reduce ? undefined : { scale }}>
            <Icon size={17} strokeWidth={1.75} />
          </motion.span>
          <span className="rail-link-label">
            <span className="rail-link-full">{item.label}</span>
            <span className="rail-link-short">{item.short}</span>
            <span className="rail-link-sub">{item.sub}</span>
          </span>
          {item.badge != null && <span className="rail-badge">{item.badge}</span>}
        </>
      )}
    </NavLink>
  );
}
