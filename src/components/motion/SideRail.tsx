import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  FileJson,
  FileSpreadsheet,
  Fuel,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../../state/store';
import './side-rail.css';

type WeekSlot = 'network' | 'ops' | 'telemetry';

const WEEK_SLOTS: {
  key: WeekSlot;
  label: string;
  hint: string;
  accept: string;
  Icon: typeof FileJson;
}[] = [
  { key: 'network', label: 'network.json', hint: 'Facility / well layout', accept: '.json,application/json', Icon: FileJson },
  { key: 'ops', label: 'ops.json', hint: 'Prices, trucks, repair hours', accept: '.json,application/json', Icon: FileJson },
  { key: 'telemetry', label: 'telemetry.csv', hint: 'Sensor readings for the week', accept: '.csv,text/csv', Icon: FileSpreadsheet },
];

/** Normalize whatever the judges named the file into the expected challenge name. */
function asChallengeFile(file: File, canonical: string): File {
  if (file.name === canonical) return file;
  return new File([file], canonical, { type: file.type || undefined, lastModified: file.lastModified });
}

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
  open,
  onOpenChange,
}: {
  alertCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const mouseY = useMotionValue(-9999);
  const slotRefs = useRef<Record<WeekSlot, HTMLInputElement | null>>({
    network: null,
    ops: null,
    telemetry: null,
  });
  const [weekOpen, setWeekOpen] = useState(false);
  const [weekFiles, setWeekFiles] = useState<Partial<Record<WeekSlot, File>>>({});
  const [weekError, setWeekError] = useState<string | null>(null);
  const { loadWeekParts, loading } = useStore();
  const weekReady = !!(weekFiles.network && weekFiles.ops && weekFiles.telemetry);

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

  const openWeekModal = () => {
    setWeekError(null);
    setWeekFiles({});
    setWeekOpen(true);
  };

  const onSlotFile = (key: WeekSlot, file: File | undefined) => {
    if (!file) return;
    const okExt =
      (key === 'telemetry' && /\.csv$/i.test(file.name)) ||
      (key !== 'telemetry' && /\.json$/i.test(file.name));
    if (!okExt) {
      setWeekError(key === 'telemetry' ? 'telemetry must be a .csv file' : `${key} must be a .json file`);
      return;
    }
    setWeekError(null);
    setWeekFiles((prev) => ({ ...prev, [key]: file }));
  };

  const submitNewWeek = () => {
    if (!weekFiles.network || !weekFiles.ops || !weekFiles.telemetry) return;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    loadWeekParts(
      {
        network: asChallengeFile(weekFiles.network, 'network.json'),
        ops: asChallengeFile(weekFiles.ops, 'ops.json'),
        telemetry: asChallengeFile(weekFiles.telemetry, 'telemetry.csv'),
      },
      `new_week_${stamp}`,
    );
    setWeekOpen(false);
    setWeekFiles({});
    setWeekError(null);
    onOpenChange(false);
  };

  const operate: RailLink[] = [
    { to: '/', end: true, label: 'Field map', short: 'Map', sub: 'Basin live', icon: MapIcon },
    { to: '/alerts', label: 'Alerts', short: 'Alerts', sub: 'Needs you', icon: Bell, badge: alertCount > 0 ? alertCount : undefined },
    { to: '/plan', label: 'Plan', short: 'Plan', sub: 'Cost paths', icon: SlidersHorizontal },
    { to: '/crew', label: 'Shifts', short: 'Shifts', sub: 'Handoff', icon: Users },
    { to: '/trends', label: 'Trends', short: 'Trends', sub: 'Sensor tape', icon: Activity },
  ];

  const review: RailLink[] = [
    { to: '/drive', label: 'Drive', short: 'Drive', sub: 'Truck run', icon: Truck },
    { to: '/tycoon', label: 'Oil Tycoon', short: 'Tycoon', sub: 'Field play', icon: Fuel },
  ];

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

          <div className="rail-nav">
            <LayoutGroup id="side-rail">
              <div className="rail-group">
                <div className="rail-group-label">Operate</div>
                {operate.map((item) => (
                  <RailItem
                    key={item.to}
                    item={item}
                    reduce={!!reduce}
                    mouseY={mouseY}
                    onNavigate={() => {
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

          <div className="rail-week">
            <button
              type="button"
              className="rail-week-btn"
              disabled={!!loading}
              onClick={openWeekModal}
            >
              <Plus size={15} />
              Add new week
            </button>
          </div>
        </div>
      </nav>

      {weekOpen && (
        <div className="week-modal" role="dialog" aria-modal="true" aria-label="Add new week">
          <button type="button" className="week-modal-scrim" aria-label="Close" onClick={() => setWeekOpen(false)} />
          <div className="week-modal-panel">
            <div className="week-modal-head">
              <div>
                <h2>Add new week</h2>
                <p>Upload the three challenge files. Names are normalized automatically.</p>
              </div>
              <button type="button" className="week-modal-x" aria-label="Close" onClick={() => setWeekOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="week-modal-slots">
              {WEEK_SLOTS.map(({ key, label, hint, accept, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`week-modal-slot${weekFiles[key] ? ' is-ready' : ''}`}
                  onClick={() => slotRefs.current[key]?.click()}
                  disabled={!!loading}
                >
                  <Icon size={16} />
                  <span className="week-modal-slot-text">
                    <strong>{label}</strong>
                    <em>{weekFiles[key] ? weekFiles[key]!.name : hint}</em>
                  </span>
                  <input
                    ref={(el) => {
                      slotRefs.current[key] = el;
                    }}
                    type="file"
                    accept={accept}
                    hidden
                    onChange={(e) => {
                      onSlotFile(key, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </button>
              ))}
            </div>

            {weekError && <div className="week-modal-error">{weekError}</div>}

            <button
              type="button"
              className="week-modal-load"
              disabled={!weekReady || !!loading}
              onClick={submitNewWeek}
            >
              Load week
            </button>
          </div>
        </div>
      )}
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
