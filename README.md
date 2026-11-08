# Avon · Water Ops Console

Night-shift console for the **Beat the Shutdown** track. It reads a produced-water network (`network.json`, `ops.json`, `telemetry.csv`), finds pump failures, pipeline leaks and worn pumps, and tells the operator what to do about any tank that is filling — trucks, early shut-ins, or wait — with the cost of every option.

Nothing is pre-computed from answer keys. Detection and planning run in the browser on the raw telemetry, in well under a second, and re-run from any point in time using the scrubber in the top bar.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` produces a static bundle in `dist/`; `npm run preview` serves it (the dataset endpoint works in preview too).

## Datasets

Any folder under `data/` that contains `network.json`, `ops.json` and `telemetry.csv` shows up in the dataset picker. The repo ships with the public challenge scenarios:

| folder | what it is |
| --- | --- |
| `full_week` | Oct 5 – Oct 11, every event resolved |
| `snapshot_2026-10-08T1200` | mid-week snapshot, pump failures in progress |
| `snapshot_2026-10-09T0330` | 3:30 AM snapshot, one filling tank + one leak |
| `snapshot_2026-10-10T0900` | morning snapshot, three failures in one system sharing trucks |
| `mock_test_2026-10-10T1530` | mock of the hidden test cut |

To try the real test cut, drop its three files in `data/test/` (it sorts last in the picker), or use **Open folder** in the top bar to load any folder without copying it.

`answer_key.json` files are kept in the folders for reference only; the app never reads them.

## Pages

- **Alerts** — what needs you right now. Filling tanks ranked by time to shutdown, each with its countdown, the recommended plan and its cost, what doing nothing would cost, and a dispatch button. Leaks and worn pumps are listed below as inspection items.
- **Network** — the map. Pipelines animate when water is flowing, nodes are color-coded by problem, click a facility for its wells → tank → pump → pipeline schematic.
- **Plan** — every option for a failure: trucks, shut-ins, their arrival times and peak tank level, with a replay chart. Trucks are planned jointly across a system; sliders let you ask "what if we had one more truck" or "what if the repair runs long".
- **Trends** — any sensor on any asset, with detected problems shaded on the chart.
- **Shifts** — one open handoff report (who is leaving / coming on, what to do now, what to watch). Step earlier/later across day·night switches; optional “who is on” tweak. Also at `/shifts`.
- **Shift log** — plain-English handoff notes (copy button), the full event history, a cost report comparing what actually happened against the recommended plans, and `events.json` export.

## How it works

See [`docs/CHALLENGE_ANALYSIS.md`](docs/CHALLENGE_ANALYSIS.md) for the physics, the event signatures, and the optimizer, all checked against the published answer keys.

- `src/lib/loader.ts` — streams `telemetry.csv` into typed arrays
- `src/lib/detector.ts` — event detection (status flags, send/receive mismatch, flow-ratio drift)
- `src/lib/planner.ts` — minute-level tank simulation, truck × trip × shut-in enumeration, joint allocation per system
- `src/lib/summary.ts` — handoff text and `events.json`
