import { MAP_SIZE, VISION_RADIUS } from "@/lib/map/constants";
import { generateTile } from "@/lib/map/generator";
import type { ViewportTile } from "@/components/game/MapCanvas";

export type Point = { x: number; y: number };

export type TileOverlay = {
  building: NonNullable<
    Extract<ViewportTile, { fog: false }>["building"]
  > | null;
  claim: NonNullable<Extract<ViewportTile, { fog: false }>["claim"]> | null;
};

function key(x: number, y: number) {
  return `${x},${y}`;
}

export function visionRadiusDefault() {
  return VISION_RADIUS;
}

/** Mark all cells in vision circle around (cx,cy) as locally explored. */
export function markVisionExplored(
  explored: Set<string>,
  cx: number,
  cy: number,
  r: number = VISION_RADIUS,
) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
      explored.add(key(x, y));
    }
  }
}

/** Absorb explored / visible cells from a server (or prior) tile list. */
export function ingestExploredFromTiles(
  explored: Set<string>,
  tiles: ViewportTile[],
) {
  for (const t of tiles) {
    if (t.fog) continue;
    explored.add(key(t.x, t.y));
  }
}

export function overlaysFromTiles(
  tiles: ViewportTile[],
): Map<string, TileOverlay> {
  const m = new Map<string, TileOverlay>();
  for (const t of tiles) {
    if (t.fog) continue;
    if (t.building || t.claim) {
      m.set(key(t.x, t.y), {
        building: t.building,
        claim: t.claim,
      });
    }
  }
  return m;
}

/**
 * Rebuild the square viewport around center with client-authoritative fog.
 * Terrain from seed; buildings/claims from optional overlay map (last server sync).
 */
export function rebuildLocalViewportTiles(opts: {
  center: Point;
  visionRadius?: number;
  worldSeed: number;
  explored: Set<string>;
  overlays?: Map<string, TileOverlay>;
}): ViewportTile[] {
  const r = opts.visionRadius ?? VISION_RADIUS;
  const { x: cx, y: cy } = opts.center;
  const r2 = r * r;
  const tiles: ViewportTile[] = [];

  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
        tiles.push({ x, y, fog: true });
        continue;
      }
      const dx = x - cx;
      const dy = y - cy;
      const inVision = dx * dx + dy * dy <= r2;
      const wasExplored = opts.explored.has(key(x, y));
      if (!inVision && !wasExplored) {
        tiles.push({ x, y, fog: true });
        continue;
      }
      const gen = generateTile(x, y, opts.worldSeed);
      const overlay = opts.overlays?.get(key(x, y));
      tiles.push({
        x,
        y,
        fog: false,
        inVision,
        explored: wasExplored || inVision,
        isLand: gen.isLand,
        terrain: gen.terrain,
        resourceType: gen.resourceType,
        building: overlay?.building ?? null,
        claim: overlay?.claim ?? null,
      });
    }
  }
  return tiles;
}
