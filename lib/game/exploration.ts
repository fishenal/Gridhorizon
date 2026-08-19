import { MAP_TILE_COUNT } from "@/lib/map/constants";

export function exploredPercent(
  cells: number,
  total: number = MAP_TILE_COUNT,
): number {
  if (total <= 0 || cells <= 0) return 0;
  return (Math.min(cells, total) / total) * 100;
}

/** Compact public score, like xp. Early values need extra decimals. */
export function formatExploredPercent(
  cells: number,
  total: number = MAP_TILE_COUNT,
): string {
  const pct = exploredPercent(cells, total);
  if (pct <= 0) return "0%";
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  return `${pct.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function formatExploredTiles(
  cells: number,
  total: number = MAP_TILE_COUNT,
): string {
  const n = Math.max(0, Math.floor(cells));
  return `${n.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} tiles`;
}
