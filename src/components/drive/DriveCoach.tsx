import { Check, ChevronRight, GraduationCap, SkipForward } from 'lucide-react';
import type { DriveTelemetry } from './DriveScene';
import type { DriveMission } from '../../lib/driveMission';

export type CoachAllow = { f?: boolean; b?: boolean; l?: boolean; r?: boolean };

export type CoachStep = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  keys?: string[];
  mode: 'continue' | 'practice';
  allow: CoachAllow;
  freeze: boolean;
  check?: (t: DriveTelemetry) => boolean;
  success: string;
};

export function buildCoachSteps(mission: DriveMission): CoachStep[] {
  return [
    {
      id: 'brief',
      eyebrow: 'Coach · 1 / 5',
      title: 'Tonight you haul water.',
      body: `${mission.tankLabel} needs a truck from the yard. This lesson stops after each move — try it, then we unlock the next tip.`,
      mode: 'continue',
      allow: {},
      freeze: true,
      success: 'Lesson locked in.',
    },
    {
      id: 'throttle',
      eyebrow: 'Coach · 2 / 5',
      title: 'Roll forward.',
      body: 'Hold W (or ↑) until the truck starts moving. You’ll feel a little drag — that’s the loaded water trailer.',
      keys: ['W'],
      mode: 'practice',
      allow: { f: true },
      freeze: false,
      check: (t) => t.speed > 2.5,
      success: 'Rolling. Good.',
    },
    {
      id: 'steer',
      eyebrow: 'Coach · 3 / 5',
      title: 'Steer while you roll.',
      body: 'Keep some speed, then tap A / D (or ← / →). Steering only bites when you’re moving — same as a real truck.',
      keys: ['A', 'D'],
      mode: 'practice',
      allow: { f: true, b: true, l: true, r: true },
      freeze: false,
      check: (t) => t.steered && t.speed > 1.2,
      success: 'You can bend the path.',
    },
    {
      id: 'aim',
      eyebrow: 'Coach · 4 / 5',
      title: 'Point at the glowing pad.',
      body: 'Watch the amber needle on the right. Turn until it points up — that means the cab faces the tank.',
      keys: ['A', 'D'],
      mode: 'practice',
      allow: { f: true, b: true, l: true, r: true },
      freeze: false,
      check: (t) => t.aligned,
      success: 'Lined up on the tank.',
    },
    {
      id: 'go',
      eyebrow: 'Coach · 5 / 5',
      title: `${mission.difficulty.label} — go.`,
      body: `Clock is ${mission.difficulty.timeLimitSec}s. Drive into the aqua ring at ${mission.tankLabel}. Miss the window and the tank trips in the ops plan.`,
      mode: 'continue',
      allow: {},
      freeze: true,
      success: 'Run live.',
    },
  ];
}

type Props = {
  step: CoachStep;
  stepIndex: number;
  total: number;
  celebrating: boolean;
  onContinue: () => void;
  onSkipAll: () => void;
};

export function DriveCoachPanel({ step, stepIndex, total, celebrating, onContinue, onSkipAll }: Props) {
  return (
    <div className={`drive-coach ${celebrating ? 'ok' : ''}`} role="dialog" aria-labelledby="driveCoachTitle">
      <div className="drive-coach-card">
        <div className="drive-coach-top">
          <span className="chip aqua">
            <GraduationCap size={12} /> {step.eyebrow}
          </span>
          <button type="button" className="btn ghost sm" onClick={onSkipAll}>
            <SkipForward size={14} /> Skip lesson
          </button>
        </div>

        {celebrating ? (
          <>
            <div className="drive-coach-ok">
              <Check size={22} />
            </div>
            <h2 id="driveCoachTitle">{step.success}</h2>
            <p className="muted">Next tip coming up…</p>
          </>
        ) : (
          <>
            <h2 id="driveCoachTitle">{step.title}</h2>
            <p>{step.body}</p>
            {step.keys && step.keys.length > 0 && (
              <div className="drive-coach-keys" aria-hidden>
                {step.keys.map((k) => (
                  <kbd key={k} className="pulse-key">{k}</kbd>
                ))}
              </div>
            )}
            <div className="drive-coach-progress" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <i key={i} className={i <= stepIndex ? 'on' : ''} />
              ))}
            </div>
            {step.mode === 'continue' ? (
              <button type="button" className="btn primary" onClick={onContinue}>
                {step.id === 'go' ? 'Start the run' : 'Got it'}
                <ChevronRight size={16} />
              </button>
            ) : (
              <p className="drive-coach-hint">Try it now — the panel advances when you succeed.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
