"use client";

import {
  formatExploredPercent,
  formatExploredTiles,
} from "@/lib/game/exploration";

type Props = {
  cells?: number | null;
  className?: string;
};

export function ExploredStat({ cells, className = "" }: Props) {
  const n = typeof cells === "number" && Number.isFinite(cells) ? cells : 0;
  return (
    <p
      className={`flex items-center gap-1 tabular-nums ${className}`}
      title={formatExploredTiles(n)}
    >
      <span aria-hidden>🗺️</span>
      <span>{formatExploredPercent(n)}</span>
    </p>
  );
}
