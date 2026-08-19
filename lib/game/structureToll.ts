import { FLAG_RANGE_RADIUS } from "@/lib/game/playerStyle";
import { TOWN_TOLL, WAYPOINT_TOLL } from "@/lib/map/constants";

export type Point = { x: number; y: number };

export type TollStructure = {
  id: number;
  x: number;
  y: number;
  radius: number;
  ownerId: number;
  type: string;
  name: string | null;
  amount: number;
  ownerName?: string;
};

export type TollEntry = {
  structure: TollStructure;
  /** Cell where the traveler entered the influence zone */
  at: Point;
};

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isInStructureRange(
  px: number,
  py: number,
  sx: number,
  sy: number,
  radius: number,
): boolean {
  return chebyshev(px, py, sx, sy) <= radius;
}

/**
 * Detect outside→inside transitions along a path segment.
 * Re-entering after leaving charges again; staying inside does not.
 */
export function findTollEntries(
  previous: Point | null,
  segment: Point[],
  structures: TollStructure[],
  travelerId: number,
): TollEntry[] {
  if (segment.length === 0 || structures.length === 0) return [];

  const tid = Number(travelerId);
  const inside = new Map<number, boolean>();
  for (const s of structures) {
    if (Number(s.ownerId) === tid) continue;
    inside.set(
      s.id,
      previous
        ? chebyshev(previous.x, previous.y, s.x, s.y) <= s.radius
        : false,
    );
  }

  const hits: TollEntry[] = [];
  for (const cell of segment) {
    for (const s of structures) {
      if (Number(s.ownerId) === tid) continue;
      const was = inside.get(s.id) ?? false;
      const now = chebyshev(cell.x, cell.y, s.x, s.y) <= s.radius;
      if (now && !was) {
        hits.push({ structure: s, at: { x: cell.x, y: cell.y } });
      }
      inside.set(s.id, now);
    }
  }
  return hits;
}

export function defaultTollAmount(
  amount: number | null | undefined,
  type?: string,
): number {
  if (amount != null) return amount;
  if (type === "town") return TOWN_TOLL;
  return WAYPOINT_TOLL;
}

export function defaultTollRadius(radius: number | null | undefined): number {
  return radius ?? FLAG_RANGE_RADIUS;
}
