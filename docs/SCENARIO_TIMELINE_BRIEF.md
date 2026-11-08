# Scenario math + timeline brief (for UX)

## What you realized (correct)

Every plan is measured **against the regular production rate**, not against zero.

- Regular night: wells stay on → facility earns `revPerHour` every hour.
- Pump dies: you either
  - keep earning that rate (if tank never trips), or
  - **lose** some of it (shut wells early / auto-shut at 92%), and/or
  - **pay** truck fees ($905 × trips).

So:

```
plan cost  =  lost production vs regular rate  +  truck fees
savings    =  do-nothing loss  −  plan cost
```

That is why a timeline should always show a quiet “would-have-earned” baseline alongside the action marks.

---

## Enchantress patterns worth stealing

From last year’s repo (`Scheduling.tsx`, `Tracking.tsx`):

1. **Gantt-ish 24h cycle preview** — one row per actor, blocks on a shared time axis (`ganttWrap` / `ganttBlock` in Scheduling).
2. **Staggered cadence chips** — “next visit in X min”, “cycle Y min” as pills, not paragraphs.
3. **Day strip** — horizontal scroll of day cards; flip/hover for event detail (Tracking).
4. **Color = state** — pink border = problem day, mint = clean; icons, not walls of text.
5. **Ruler under meters** — tick marks so “how full / how far” is scannable.

For Avon, the natural port is a **repair-window Gantt** (not 24h calendar):

```
Now ── truck ── would-trip ── repair
██████ earning at regular rate ██████░░░░ lost ░░░
```

One row per compared plan (do nothing / best truck / best shut-in / recommended).

---

## What the algorithm already enumerates

For each pump failure, at a planning instant (`now`):

| Axis | Values tried |
|---|---|
| Trucks allocated | `0 … fleet` |
| Trips per truck | `1 … 3` (if trucks > 0) |
| Well shut-in subset | all `2^n − 1` non-empty subsets |
| Shut-in start | binary-searched **latest** minute that still avoids 92% |
| Joint fleet | all ways to split fleet across simultaneous failures in one system |

That is exhaustive for the challenge’s discrete action space (not ML weights — combinatorial search). Output lives in `docs/scenario_sweeps/`.

Families labeled for UI grouping:

| Family | Meaning |
|---|---|
| `wait_safe` | Do nothing; tank never hits 92% before repair |
| `do_nothing` | Do nothing; tank *does* hit 92% (auto shut-in loss) |
| `trucks_only` | Haul water, wells stay on |
| `shut_in_only` | Turn wells off early, no trucks |
| `mixed` | Trucks + voluntary shut-in |

---

## Evidence from the full-week sweep

Planned in isolation at onset+5min (full fleet free):

| Pattern you named | Real example |
|---|---|
| Shut-in more profitable than trucks | **EV-018** S4_B: shut B1 @ +302m **$469** vs truck $905 |
| Dumping (truck) more profitable | **EV-009** S1_C: 1×1 trip **$905** vs shut-in ~$2k vs nothing ~$5k |
| Danger zone never hits | **EV-006** S1_B: best = do nothing **$0** |
| Repair “in time” in the sense of never tripping | same EV-006 — 6h repair finishes with peak &lt; 92% |
| Need mix | **EV-021** S4_A: 1 truck + shut A2 **$975** |
| Need 2 truck-trips | **EV-015** S4_C: 1 truck × 2 trips **$1,810** |

When trucks are **shared** (joint windows in `full_week.json` → `joints`), the isolated “$905 truck” answer can flip to a shut-in for the facility that loses less money per hour of shut-in. That contention is the second timeline the UI must show: **who has the trucks**.

---

## Scenario object the UI should bind to

See `src/lib/scenarios.ts` → `ScenarioCompare`:

- `baselineRevenue` — regular-rate earnings over the repair window  
- `lostProduction` / `truckCost` / `cost`  
- `productionKeptPct` — how much of regular rate you kept  
- `savingsVsDoNothing`  
- `timeline[]` — `{ kind, atMin, label }` with `now | truck | shut_in | would_trip | trip | repair | truck_free`  
- `levelTracePct` — minute tank % for the what-if chart  

Regenerate sweeps:

```bash
npx tsx scripts/sweep-scenarios.ts
```

---

## Suggested UX direction (for you to decide next)

1. **Compare strip** — 3–4 plan rows as Enchantress gantt blocks on one shared axis (Now → Repair), colored by earning vs lost.
2. **Baseline ribbon** — always draw “regular rate” as the full green/cyan bar; holes = lost production.
3. **Family filters** — chips: Safe wait · Trucks · Shut-ins · Mixed.
4. **Contention callout** — when `joints` allocate 0 trucks to a facility, show “trucks busy on Facility X until HH:MM”.
