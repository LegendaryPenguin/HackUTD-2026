import "./adjustable-glass-dashboard.css";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Bell,
  Check,
  Download,
  Home,
  Layers,
  Moon,
  Search,
  Settings2,
  Sun,
  Target,
  Wallet,
  X,
  ChartNoAxesCombined,
  CreditCard,
  Coffee,
  ShoppingBag,
  Building2,
  Plane,
} from "lucide-react";

gsap.registerPlugin(useGSAP);

export type GlassSettings = {
  blur: number;
  opacity: number;
  saturation: number;
  tint: string;
  edge: number;
};
export type WorkspaceTransaction = {
  id: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  status: "Completed" | "Pending";
};
export type WorkspaceGoal = {
  id: string;
  name: string;
  saved: number;
  target: number;
  color?: string;
};
export type WorkspaceCashFlowPoint = {
  label: string;
  /** Nonnegative amounts in the selected currency, not cumulative balances. */
  income: number;
  expenses: number;
};
export type WorkspaceCashFlowPeriod = {
  id: string;
  label: string;
  points: WorkspaceCashFlowPoint[];
  description?: string;
};
export type WorkspaceAccount = { name: string; lastFour?: string };
export type WorkspaceBalanceChange = { percent: number; label: string };
export interface GlassWorkspaceProps {
  brand?: string;
  userName?: string;
  backgroundImage?: string;
  balance?: number;
  balanceChange?: WorkspaceBalanceChange;
  account?: WorkspaceAccount;
  periodLabel?: string;
  cashFlowPeriods?: WorkspaceCashFlowPeriod[];
  initialPeriodId?: string;
  footerNote?: string;
  savingsNote?: string;
  transactions?: WorkspaceTransaction[];
  goals?: WorkspaceGoal[];
  glass?: Partial<GlassSettings>;
  onGlassChange?: (settings: GlassSettings) => void;
  currency?: string;
  theme?: "system" | "light" | "dark";
  /** Inherit complete Tailwind v4 --color-* tokens. The host owns theme switching. */
  useHostTheme?: boolean;
  className?: string;
  style?: CSSProperties;
}

const defaults: GlassSettings = {
  blur: 22,
  opacity: 0.3,
  saturation: 1.2,
  tint: "#ffffff",
  edge: 0.6,
};
const tabs = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "activity", label: "Activity", icon: Wallet },
  { id: "savings", label: "Savings", icon: Target },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
] as const;
type View = (typeof tabs)[number]["id"];
const bounded = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const normalize = (v: Partial<GlassSettings>): GlassSettings => ({
  blur: bounded(v.blur ?? defaults.blur, 0, 40, defaults.blur),
  opacity: bounded(v.opacity ?? defaults.opacity, 0.08, 0.9, defaults.opacity),
  saturation: bounded(
    v.saturation ?? defaults.saturation,
    0.5,
    2,
    defaults.saturation,
  ),
  edge: bounded(v.edge ?? defaults.edge, 0, 1, defaults.edge),
  tint: /^#[0-9a-f]{6}$/i.test(v.tint ?? "") ? v.tint! : defaults.tint,
});
const nonnegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
const goalProgress = (goal: WorkspaceGoal) =>
  goal.target > 0 ? bounded((goal.saved / goal.target) * 100, 0, 100, 0) : 0;

function IconFor({ category }: { category: string }) {
  const Icon =
    category === "Income"
      ? ArrowDownLeft
      : category === "Dining"
        ? Coffee
        : category === "Travel"
          ? Plane
          : category === "Shopping"
            ? ShoppingBag
            : Building2;
  return <Icon size={17} strokeWidth={1.7} aria-hidden="true" />;
}

export default function GlassWorkspace({
  brand = "Workspace",
  userName,
  backgroundImage,
  balance = 0,
  balanceChange,
  account,
  periodLabel,
  cashFlowPeriods = [],
  initialPeriodId,
  footerNote,
  savingsNote,
  transactions = [],
  goals = [],
  glass = defaults,
  onGlassChange,
  currency = "USD",
  theme = "system",
  useHostTheme = true,
  className = "",
  style,
}: GlassWorkspaceProps) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, "");
  const [view, setView] = useState<View>("overview");
  const [material, setMaterial] = useState(() => normalize(glass));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localTheme, setLocalTheme] = useState(theme);
  const [periodId, setPeriodId] = useState(
    initialPeriodId ?? cashFlowPeriods[0]?.id ?? "",
  );
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [alerts, setAlerts] = useState(false);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  useEffect(
    () => setMaterial(normalize(glass)),
    [glass.blur, glass.opacity, glass.saturation, glass.tint, glass.edge],
  );
  useEffect(() => setLocalTheme(theme), [theme]);
  useEffect(() => {
    if (initialPeriodId !== undefined) setPeriodId(initialPeriodId);
  }, [initialPeriodId]);
  useEffect(() => {
    if (settingsOpen)
      root.current
        ?.querySelector<HTMLButtonElement>(".gw-material button")
        ?.focus();
  }, [settingsOpen]);
  useEffect(() => setBackgroundFailed(false), [backgroundImage]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const money = useMemo(() => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      });
    } catch {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      });
    }
  }, [currency]);
  const format = (v: number) => money.format(Number.isFinite(v) ? v : 0);
  const spent = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum - t.amount, 0);
  const totalSaved = goals.reduce((sum, g) => sum + Math.max(0, g.saved), 0);
  const visibleTransactions = transactions.filter((t) =>
    `${t.name} ${t.category}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const selectedPeriod =
    cashFlowPeriods.find((item) => item.id === periodId) ?? cashFlowPeriods[0];
  const points = selectedPeriod?.points ?? [];
  const income = points.reduce(
    (sum, point) => sum + nonnegative(point.income),
    0,
  );
  const expenses = points.reduce(
    (sum, point) => sum + nonnegative(point.expenses),
    0,
  );
  const chartMaximum = Math.max(
    1,
    ...points.flatMap((point) => [
      nonnegative(point.income),
      nonnegative(point.expenses),
    ]),
  );
  const chartX = (index: number) =>
    points.length === 1 ? 300 : (index * 600) / (points.length - 1);
  const chartY = (value: number) =>
    180 - (nonnegative(value) / chartMaximum) * 160;
  const linePoints = (key: "income" | "expenses") =>
    points
      .map((point, index) => `${chartX(index)},${chartY(point[key])}`)
      .join(" ");
  const chartLabelIndices = new Set(
    Array.from({ length: Math.min(points.length, 6) }, (_, index) =>
      points.length <= 6
        ? index
        : Math.round((index * (points.length - 1)) / 5),
    ),
  );
  const spendingCategories = Array.from(
    new Set(
      transactions
        .filter((item) => item.amount < 0)
        .map((item) => item.category),
    ),
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const panels = content.current?.querySelectorAll(".gw-reveal");
        if (!panels?.length) return;
        gsap.fromTo(
          panels,
          { y: 12, opacity: 0.45, filter: "blur(3px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.48,
            stagger: 0.045,
            ease: "power3.out",
            clearProps: "transform,opacity,filter",
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [view], revertOnUpdate: true },
  );

  function updateGlass(patch: Partial<GlassSettings>) {
    const next = normalize({ ...material, ...patch });
    setMaterial(next);
    onGlassChange?.(next);
  }
  function closeSettings() {
    setSettingsOpen(false);
    settingsTrigger.current?.focus();
  }
  function changeView(next: View) {
    setView(next);
    setAlerts(false);
  }
  function toggleTheme() {
    const scheme = root.current
      ? getComputedStyle(root.current).colorScheme
      : "normal";
    const isDark =
      scheme === "dark" ||
      (scheme !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setLocalTheme(isDark ? "light" : "dark");
  }
  function exportReport() {
    const clean = (v: string) =>
      `"${(/^[\s]*[=+@-]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"`;
    const csv = [
      "Name,Category,Date,Amount,Status",
      ...visibleTransactions.map((t) =>
        [
          clean(t.name),
          clean(t.category),
          clean(t.date),
          t.amount,
          clean(t.status),
        ].join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Transactions exported.");
  }
  const nav = (compact = false) => (
    <nav
      className={compact ? "gw-rail gw-glass" : "gw-dock gw-glass"}
      aria-label={compact ? "Quick navigation" : "Workspace views"}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          aria-label={compact ? tab.label : undefined}
          title={compact ? tab.label : undefined}
          aria-current={view === tab.id ? "page" : undefined}
          onClick={() => changeView(tab.id)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 3
                  : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
            changeView(tabs[next].id);
            (
              e.currentTarget.parentElement?.children[next] as HTMLButtonElement
            )?.focus();
          }}
        >
          <tab.icon size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
  const periodSelector = (label: string) =>
    cashFlowPeriods.length > 1 ? (
      <div className="gw-segment" role="group" aria-label={label}>
        {cashFlowPeriods.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selectedPeriod?.id === item.id}
            onClick={() => setPeriodId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null;
  const chart = points.length ? (
    <div className="gw-chart-wrap">
      <div className="gw-chart-labels">
        <span>{format(chartMaximum)}</span>
        <span>{format(chartMaximum / 2)}</span>
        <span>{format(0)}</span>
      </div>
      <svg
        viewBox="0 0 600 185"
        role="img"
        aria-label={`${selectedPeriod?.label ?? "Cash flow"}: money in ${format(income)}, money out ${format(expenses)}.`}
        preserveAspectRatio="none"
      >
        <desc>
          {points
            .map(
              (point) =>
                `${point.label}: income ${format(nonnegative(point.income))}, expenses ${format(nonnegative(point.expenses))}`,
            )
            .join(". ")}
        </desc>
        <defs>
          <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--gw-accent)" stopOpacity=".23" />
            <stop offset="1" stopColor="var(--gw-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 100, 180].map((y) => (
          <path
            key={y}
            d={`M0 ${y} H600`}
            stroke="currentColor"
            opacity=".11"
            strokeDasharray="3 5"
          />
        ))}
        <path
          d={`M${chartX(0)} 185 ${points.map((point, index) => `L${chartX(index)} ${chartY(point.income)}`).join(" ")} L${chartX(points.length - 1)} 185 Z`}
          fill={`url(#${id}-area)`}
        />
        <polyline
          points={linePoints("income")}
          fill="none"
          stroke="var(--gw-accent)"
          strokeWidth="2.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={linePoints("expenses")}
          fill="none"
          stroke="currentColor"
          strokeOpacity=".45"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.length === 1 && (
          <>
            <circle
              cx="300"
              cy={chartY(points[0].income)}
              r="4"
              fill="var(--gw-accent)"
            />
            <circle
              cx="300"
              cy={chartY(points[0].expenses)}
              r="4"
              fill="currentColor"
              opacity=".45"
            />
          </>
        )}
      </svg>
      <div className="gw-chart-months">
        {points.map(
          (point, index) =>
            chartLabelIndices.has(index) && (
              <span
                key={`${point.label}-${index}`}
                style={{
                  left: `${chartX(index) / 6}%`,
                  transform:
                    index === 0 && points.length > 1
                      ? "none"
                      : index === points.length - 1 && points.length > 1
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {point.label}
              </span>
            ),
        )}
      </div>
    </div>
  ) : (
    <div className="gw-empty gw-chart-empty">
      <ChartNoAxesCombined size={23} aria-hidden="true" />
      <h3>No cash-flow data yet</h3>
      <p>Cash flow will appear when period data is available.</p>
    </div>
  );
  const transactionList = (limit?: number) => (
    <div className="gw-transactions">
      {visibleTransactions.length ? (
        visibleTransactions.slice(0, limit).map((t) => (
          <div className="gw-transaction" key={t.id}>
            <span
              className={`gw-transaction-icon ${t.amount > 0 ? "is-income" : ""}`}
            >
              <IconFor category={t.category} />
            </span>
            <div className="gw-transaction-name">
              <strong>{t.name}</strong>
              <span>
                {t.category} · {t.date}
              </span>
            </div>
            <span
              className={`gw-transaction-status ${t.status === "Pending" ? "is-pending" : ""}`}
            >
              {t.status === "Completed" && (
                <Check size={12} aria-hidden="true" />
              )}
              {t.status}
            </span>
            <strong className={t.amount > 0 ? "gw-positive" : ""}>
              {t.amount > 0 ? "+" : "−"}
              {format(Math.abs(t.amount))}
            </strong>
          </div>
        ))
      ) : (
        <div className="gw-empty">
          <Search size={23} aria-hidden="true" />
          <h3>{filter ? "No matching transactions" : "No transactions yet"}</h3>
          <p>
            {filter
              ? "Try another name or category."
              : "Your activity will appear here."}
          </p>
          {filter && (
            <button type="button" onClick={() => setFilter("")}>
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
  const goalList = (
    <div className="gw-goals">
      {goals.length ? (
        goals.map((g, i) => (
          <div className="gw-goal" key={g.id}>
            <div className="gw-goal-top">
              <span className="gw-goal-icon">
                {i % 2 ? (
                  <Plane size={18} aria-hidden="true" />
                ) : (
                  <Target size={18} aria-hidden="true" />
                )}
              </span>
              <strong>{g.name}</strong>
              <span>{Math.round(goalProgress(g))}%</span>
            </div>
            <div
              className="gw-goal-track"
              role="progressbar"
              aria-label={g.name}
              aria-valuenow={Math.round(goalProgress(g))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{
                  width: `${goalProgress(g)}%`,
                  background: g.color,
                }}
              />
            </div>
            <p>
              <strong>{format(g.saved)}</strong>
              <span>of {format(g.target)}</span>
            </p>
          </div>
        ))
      ) : (
        <p className="gw-empty">No savings goals yet.</p>
      )}
    </div>
  );

  return (
    <div
      ref={root}
      className={`gw-root ${className}`}
      data-theme={useHostTheme ? "system" : localTheme}
      data-host-theme={useHostTheme}
      style={
        {
          "--gw-blur": `${material.blur}px`,
          "--gw-opacity": material.opacity,
          "--gw-saturation": material.saturation,
          "--gw-tint": useHostTheme
            ? `color-mix(in srgb, var(--color-background, Canvas) 80%, ${material.tint})`
            : material.tint,
          "--gw-edge": material.edge,
          ...style,
        } as CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (settingsOpen) closeSettings();
          setAlerts(false);
        }
      }}
    >
      {backgroundImage && !backgroundFailed && (
        <img
          className="gw-room"
          src={backgroundImage}
          alt=""
          onError={() => setBackgroundFailed(true)}
        />
      )}
      <div className="gw-room-shade" aria-hidden="true" />
      <div className="gw-workspace">
        <header className="gw-topbar gw-glass">
          <a
            className="gw-brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              changeView("overview");
            }}
          >
            <span className="gw-brand-icon">
              <Layers size={18} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <strong>{brand}</strong>
            <span className="gw-brand-divider" />
            <span className="gw-personal">Personal workspace</span>
          </a>
          <div className="gw-toolbar">
            <button
              type="button"
              className="gw-adjust"
              ref={settingsTrigger}
              onClick={() => {
                setSettingsOpen(!settingsOpen);
                setAlerts(false);
              }}
              aria-expanded={settingsOpen}
              aria-controls={`${id}-material`}
            >
              <Settings2 size={16} aria-hidden="true" />
              <span>Adjust glass</span>
            </button>
            {!useHostTheme && (
              <button
                type="button"
                className="gw-icon-button"
                aria-label="Toggle light and dark theme"
                onClick={toggleTheme}
              >
                <Sun className="gw-sun" size={17} aria-hidden="true" />
                <Moon className="gw-moon" size={17} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="gw-icon-button gw-bell"
              aria-label="Notifications"
              aria-expanded={alerts}
              onClick={() => {
                setAlerts(!alerts);
                setSettingsOpen(false);
              }}
            >
              <Bell size={17} aria-hidden="true" />
              <i />
            </button>
            {userName && (
              <span className="gw-avatar" title={userName}>
                {userName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </header>
        <div className="gw-stage">
          {nav(true)}
          <main className="gw-main gw-glass">
            <div className="gw-view-heading">
              <div>
                <p className="gw-greeting">
                  {view === "overview" && userName
                    ? `Welcome back, ${userName}.`
                    : "Your personal workspace"}
                </p>
                <h1>
                  {view === "overview"
                    ? "Overview"
                    : view === "activity"
                      ? "Activity"
                      : view === "savings"
                        ? "Savings & goals"
                        : "Reports"}
                </h1>
              </div>
              <div className="gw-heading-action">
                {view === "activity" || view === "reports" ? (
                  <button
                    type="button"
                    className="gw-button"
                    onClick={exportReport}
                  >
                    <Download size={14} aria-hidden="true" />
                    Export CSV
                  </button>
                ) : (
                  periodLabel && <span className="gw-date">{periodLabel}</span>
                )}
              </div>
            </div>
            <div className="gw-mobile-nav">{nav()}</div>
            <div ref={content} key={view} className="gw-view">
              {view === "overview" && (
                <>
                  <div className="gw-overview-grid">
                    <section className="gw-panel gw-balance gw-reveal">
                      <div className="gw-panel-title">
                        <span>Available balance</span>
                        <Wallet size={17} aria-hidden="true" />
                      </div>
                      <strong className="gw-balance-value">
                        {format(balance)}
                      </strong>
                      {balanceChange &&
                        Number.isFinite(balanceChange.percent) && (
                          <p className="gw-balance-meta">
                            <span
                              className={
                                balanceChange.percent >= 0
                                  ? "gw-positive"
                                  : undefined
                              }
                            >
                              {balanceChange.percent > 0 ? "+" : ""}
                              {balanceChange.percent}%
                            </span>{" "}
                            {balanceChange.label}
                          </p>
                        )}
                      {account && (
                        <div className="gw-account">
                          <span className="gw-account-icon">
                            <CreditCard size={19} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>{account.name}</strong>
                            {account.lastFour && (
                              <span>•••• {account.lastFour.slice(-4)}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label="View account activity"
                            onClick={() => changeView("activity")}
                          >
                            <ArrowUpRight size={20} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="gw-panel gw-cashflow gw-reveal">
                      <div className="gw-panel-title">
                        <h2>Cash flow</h2>
                        {periodSelector("Chart period")}
                      </div>
                      <div className="gw-chart-summary">
                        <div>
                          <span>
                            <i />
                            Money in
                          </span>
                          <strong>{format(income)}</strong>
                        </div>
                        <div>
                          <span>
                            <i />
                            Money out
                          </span>
                          <strong>{format(expenses)}</strong>
                        </div>
                      </div>
                      {chart}
                    </section>
                  </div>
                  <div className="gw-lower-grid">
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>Recent activity</h2>
                        <button
                          className="gw-text-button"
                          type="button"
                          onClick={() => changeView("activity")}
                        >
                          View all
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                      {transactionList(4)}
                    </section>
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>Savings goals</h2>
                        <span className="gw-small-label">
                          {goals.length} active
                        </span>
                      </div>
                      {goalList}
                    </section>
                  </div>
                </>
              )}
              {view === "activity" && (
                <section className="gw-panel gw-reveal">
                  <div className="gw-panel-title">
                    <h2>
                      Transactions{" "}
                      <span className="gw-count">{transactions.length}</span>
                    </h2>
                    <label className="gw-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        aria-label="Search transactions"
                        placeholder="Search transactions"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      {filter && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setFilter("")}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </label>
                  </div>
                  {transactionList()}
                </section>
              )}
              {view === "savings" && (
                <>
                  <div className="gw-savings-intro gw-reveal">
                    <span className="gw-savings-orb">
                      <Target size={28} strokeWidth={1.3} aria-hidden="true" />
                    </span>
                    <div>
                      <p>Total saved</p>
                      <strong>{format(totalSaved)}</strong>
                    </div>
                    <span>
                      {goals.length} savings goals
                      <br />
                      Tracked in one place
                    </span>
                  </div>
                  <section className="gw-panel gw-reveal">
                    <div className="gw-panel-title">
                      <h2>Your goals</h2>
                      <span>{goals.length} active</span>
                    </div>
                    {goalList}
                  </section>
                  {savingsNote && (
                    <section className="gw-savings-note gw-reveal">
                      <Check size={18} aria-hidden="true" />
                      <p>{savingsNote}</p>
                    </section>
                  )}
                </>
              )}
              {view === "reports" && (
                <>
                  <div className="gw-report-stats gw-reveal">
                    {[
                      {
                        label: "Money in",
                        value: income,
                        icon: ArrowDownLeft,
                      },
                      {
                        label: "Money out",
                        value: expenses,
                        icon: ArrowUpRight,
                      },
                      {
                        label: "Net cash flow",
                        value: income - expenses,
                        icon: ChartNoAxesCombined,
                      },
                    ].map((s) => (
                      <section className="gw-panel" key={s.label}>
                        <div className="gw-panel-title">
                          <span>{s.label}</span>
                          <s.icon size={17} aria-hidden="true" />
                        </div>
                        <strong>{format(s.value)}</strong>
                        <span>{selectedPeriod?.label ?? "No period data"}</span>
                      </section>
                    ))}
                  </div>
                  <div className="gw-reports-grid">
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>Income & expenses</h2>
                        {periodSelector("Report period")}
                      </div>
                      <div className="gw-chart-legend">
                        <span>
                          <i />
                          Money in
                        </span>
                        <span>
                          <i />
                          Money out
                        </span>
                      </div>
                      {chart}
                      {selectedPeriod?.description && (
                        <p className="gw-chart-footnote">
                          {selectedPeriod.description}
                        </p>
                      )}
                    </section>
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>Where it goes</h2>
                        <span>All supplied activity</span>
                      </div>
                      <div className="gw-category-list">
                        {spendingCategories.map((category, i) => {
                          const value = transactions
                            .filter(
                              (t) => t.category === category && t.amount < 0,
                            )
                            .reduce((s, t) => s - t.amount, 0);
                          return (
                            <div key={category}>
                              <div>
                                <IconFor category={category} />
                                <span>{category}</span>
                                <strong>{format(value)}</strong>
                              </div>
                              <span className="gw-category-track">
                                <i
                                  style={{
                                    width: `${spent ? (value / spent) * 100 : 0}%`,
                                    opacity: Math.max(0.4, 1 - i * 0.14),
                                  }}
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
            {footerNote && (
              <footer className="gw-footer">
                <span>
                  <i />
                  {footerNote}
                </span>
              </footer>
            )}
            <div className="gw-desktop-dock">{nav()}</div>
          </main>
        </div>
        {alerts && (
          <aside
            className="gw-notifications gw-glass"
            aria-label="Notifications"
          >
            <div>
              <h2>You're all caught up.</h2>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setAlerts(false)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <p>No new notifications.</p>
          </aside>
        )}
        {settingsOpen && (
          <aside
            className="gw-material gw-glass"
            id={`${id}-material`}
            aria-label="Glass appearance"
          >
            <div className="gw-material-title">
              <div>
                <span className="gw-material-icon">
                  <Settings2 size={18} aria-hidden="true" />
                </span>
                <h2>Glass appearance</h2>
              </div>
              <button
                type="button"
                className="gw-icon-button"
                aria-label="Close glass settings"
                onClick={closeSettings}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p>Adjust the material across your workspace.</p>
            <div className="gw-material-sample" aria-hidden="true">
              <Layers size={28} strokeWidth={1.1} />
              <span>Live material preview</span>
            </div>
            <div className="gw-presets" aria-label="Glass presets">
              {[
                {
                  name: "Clear",
                  value: { blur: 8, opacity: 0.12, saturation: 1.1, edge: 0.8 },
                },
                { name: "Frosted", value: defaults },
                {
                  name: "Solid",
                  value: { blur: 32, opacity: 0.86, saturation: 1, edge: 0.35 },
                },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => updateGlass(p.value)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {[
              {
                key: "blur",
                label: "Blur",
                min: 0,
                max: 40,
                step: 1,
                value: `${Math.round(material.blur)} px`,
              },
              {
                key: "opacity",
                label: "Opacity",
                min: 0.08,
                max: 0.9,
                step: 0.01,
                value: `${Math.round(material.opacity * 100)}%`,
              },
              {
                key: "saturation",
                label: "Saturation",
                min: 0.5,
                max: 2,
                step: 0.05,
                value: `${Math.round(material.saturation * 100)}%`,
              },
              {
                key: "edge",
                label: "Edge light",
                min: 0,
                max: 1,
                step: 0.05,
                value: `${Math.round(material.edge * 100)}%`,
              },
            ].map((c) => (
              <label className="gw-range" key={c.key}>
                <span>
                  {c.label}
                  <output>{c.value}</output>
                </span>
                <input
                  type="range"
                  aria-label={c.label}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={material[c.key as keyof GlassSettings]}
                  onChange={(e) =>
                    updateGlass({ [c.key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <label className="gw-tint">
              Glass tint{" "}
              <input
                type="color"
                value={material.tint}
                onChange={(e) => updateGlass({ tint: e.target.value })}
              />
            </label>
            <button
              className="gw-reset"
              type="button"
              onClick={() => updateGlass(normalize(glass))}
            >
              Reset appearance
            </button>
          </aside>
        )}
      </div>
      {notice && (
        <div className="gw-toast" role="status">
          <Check size={16} aria-hidden="true" />
          {notice}
        </div>
      )}
    </div>
  );
}
