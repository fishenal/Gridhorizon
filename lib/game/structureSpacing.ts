import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { STRUCTURE_SPACING_RADIUS } from "@/lib/map/constants";

export const SPACED_STRUCTURE_TYPES = ["flag", "town", "waypoint"] as const;

export type SpacedStructureType = (typeof SPACED_STRUCTURE_TYPES)[number];

export const STRUCTURE_TOO_CLOSE_MSG =
  "Too close to another flag or town (need 20×20 clear)";

export function isSpacedStructureType(type: string): type is SpacedStructureType {
  return (SPACED_STRUCTURE_TYPES as readonly string[]).includes(type);
}

/**
 * True if any structure sits within Chebyshev distance ≤ radius
 * (so a 20×20 window could contain both when radius is STRUCTURE_SPACING_RADIUS).
 */
export function isTooCloseToAnyStructure(
  x: number,
  y: number,
  others: Iterable<{ x: number; y: number }>,
  radius: number = STRUCTURE_SPACING_RADIUS,
): boolean {
  for (const o of others) {
    if (Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= radius) {
      return true;
    }
  }
  return false;
}

/**
 * True if another flag/town already sits within Chebyshev distance
 * STRUCTURE_SPACING_RADIUS (so a 20×20 window could contain both).
 */
export async function hasNearbyStructure(
  db: Db,
  mapId: number,
  x: number,
  y: number,
): Promise<boolean> {
  const r = STRUCTURE_SPACING_RADIUS;
  const nearby = await db
    .select({
      x: buildings.x,
      y: buildings.y,
      type: buildings.type,
    })
    .from(buildings)
    .where(
      and(
        eq(buildings.mapId, mapId),
        inArray(buildings.type, [...SPACED_STRUCTURE_TYPES]),
        gte(buildings.x, x - r),
        lte(buildings.x, x + r),
        gte(buildings.y, y - r),
        lte(buildings.y, y + r),
      ),
    );

  return isTooCloseToAnyStructure(x, y, nearby, r);
}
