"use client";

import { useState } from "react";
import { MAX_TRAVEL_STEPS } from "@/lib/map/constants";

const DIRS: Array<{ dx: number; dy: number; label: string } | null> = [
  { dx: -1, dy: -1, label: "↖" },
  { dx: 0, dy: -1, label: "↑" },
  { dx: 1, dy: -1, label: "↗" },
  { dx: -1, dy: 0, label: "←" },
  null, // center input
  { dx: 1, dy: 0, label: "→" },
  { dx: -1, dy: 1, label: "↙" },
  { dx: 0, dy: 1, label: "↓" },
  { dx: 1, dy: 1, label: "↘" },
];

export type TravelProgress = {
  origin: { x: number; y: number };
  target: { x: number; y: number };
  /** 0..1 */
  progress: number;
};

type Props = {
  busy: boolean;
  traveling: boolean;
  travelProgress: TravelProgress | null;
  onMove: (dx: number, dy: number, steps: number) => Promise<void>;
  onStop: () => void;
};

export function MovePad({
  busy,
  traveling,
  travelProgress,
  onMove,
  onStop,
}: Props) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(-1);
  const [steps, setSteps] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [stepsError, setStepsError] = useState("");

  const locked = busy || traveling || submitting;

  async function handleMove() {
    if ((dx === 0 && dy === 0) || locked) return;
    const n = Number(steps);
    if (!Number.isFinite(n) || n < 1 || n > MAX_TRAVEL_STEPS) {
      setStepsError(`步数须为 1–${MAX_TRAVEL_STEPS}`);
      return;
    }
    setStepsError("");
    setSubmitting(true);
    try {
      await onMove(dx, dy, Math.floor(n));
    } finally {
      setSubmitting(false);
    }
  }

  const pct = travelProgress
    ? Math.max(0, Math.min(100, Math.round(travelProgress.progress * 100)))
    : 0;

  return (
    <div className="pointer-events-auto w-[200px] rounded-xl border border-stone-200 bg-white/95 p-2 shadow-lg backdrop-blur">
      {travelProgress ? (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center justify-between gap-1 text-[10px] tabular-nums text-stone-600">
            <span>
              ({travelProgress.origin.x},{travelProgress.origin.y})
            </span>
            <span>
              ({travelProgress.target.x},{travelProgress.target.y})
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-stone-200"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-pink-500 transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onStop}
            className="w-full rounded-lg border border-stone-300 bg-white py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            终止
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1">
        {DIRS.map((d) => {
          if (d === null) {
            return (
              <input
                key="steps"
                type="number"
                min={1}
                max={MAX_TRAVEL_STEPS}
                value={steps}
                disabled={locked}
                onChange={(e) => {
                  setSteps(Number(e.target.value));
                  setStepsError("");
                }}
                className={`h-10 w-full rounded border bg-white text-center text-sm tabular-nums disabled:opacity-50 ${
                  stepsError
                    ? "border-rose-400"
                    : "border-stone-300"
                }`}
                aria-label="移动格数"
              />
            );
          }
          const active = dx === d.dx && dy === d.dy;
          return (
            <button
              key={d.label}
              type="button"
              disabled={locked}
              onClick={() => {
                setDx(d.dx);
                setDy(d.dy);
              }}
              className={`flex h-10 items-center justify-center rounded border text-lg disabled:opacity-50 ${
                active
                  ? "border-pink-500 bg-pink-100 text-pink-700"
                  : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
              }`}
              aria-label={`方向 ${d.label}`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      {stepsError ? (
        <p className="mt-1.5 text-center text-[11px] text-rose-600">{stepsError}</p>
      ) : null}
      <button
        type="button"
        disabled={locked || (dx === 0 && dy === 0)}
        onClick={() => void handleMove()}
        className="mt-2 w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        Move
      </button>
    </div>
  );
}
