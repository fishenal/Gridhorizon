import { CHUNK_SIZE, MAP_SIZE, WORLD_SEED } from "./constants";

/** Surface biomes (procedural; not stored in DB). */
export type Terrain = "water" | "grass" | "forest" | "mountain" | "desert";
export type ResourceType = "none" | "stone" | "wood" | "ore";

export type TileInfo = {
  x: number;
  y: number;
  isLand: boolean;
  terrain: Terrain;
  resourceType: ResourceType;
};

function hash2(x: number, y: number, seed: number): number {
  let n = x * 374761393 + y * 668265263 + seed * 982451653;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, seed: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Combined elevation ~0..1.65 (mean ≈ 0.825). */
function elevation(x: number, y: number, seed: number): number {
  const n1 = smoothNoise(x, y, seed, 180);
  const n2 = smoothNoise(x, y, seed + 17, 64) * 0.45;
  const n3 = smoothNoise(x, y, seed + 91, 24) * 0.2;
  return n1 + n2 + n3;
}

function moisture(x: number, y: number, seed: number): number {
  return smoothNoise(x, y, seed + 200, 100);
}

function aridity(x: number, y: number, seed: number): number {
  return smoothNoise(x, y, seed + 411, 120);
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

/**
 * Water = ocean (low elev) + inland lakes (moist depressions).
 * Rough share: ~32–38% of map.
 */
function isWaterAt(x: number, y: number, seed: number): boolean {
  if (!inBounds(x, y)) return true;
  const elev = elevation(x, y, seed);
  if (elev < 0.56) return true;
  const moist = moisture(x, y, seed);
  const lake = smoothNoise(x, y, seed + 333, 48);
  // Compact inland lakes on mid-low land
  if (elev < 0.74 && moist > 0.62 && lake > 0.82) return true;
  return false;
}

export function hasWaterNeighbor(
  x: number,
  y: number,
  seed: number,
): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx!;
    const ny = y + dy!;
    if (!inBounds(nx, ny) || isWaterAt(nx, ny, seed)) return true;
  }
  return false;
}

export function generateTile(
  x: number,
  y: number,
  seed: number = WORLD_SEED,
): TileInfo {
  if (!inBounds(x, y)) {
    return { x, y, isLand: false, terrain: "water", resourceType: "none" };
  }

  if (isWaterAt(x, y, seed)) {
    return { x, y, isLand: false, terrain: "water", resourceType: "none" };
  }

  const elev = elevation(x, y, seed);
  const moist = moisture(x, y, seed);
  const dry = aridity(x, y, seed);
  const shore = hasWaterNeighbor(x, y, seed);

  // Land biome mix (of land ≈ 62–68% of map):
  // mountain ~12%, forest ~28%, desert/beach ~18%, grass ~42%
  let terrain: Terrain = "grass";
  if (elev > 0.95) {
    terrain = "mountain";
  } else if (shore && (elev < 0.7 || dry > 0.45)) {
    // Beach / lakeside sand
    terrain = "desert";
  } else if (dry > 0.62 && moist < 0.42 && elev < 0.9) {
    terrain = "desert";
  } else if (moist > 0.52 && elev < 0.92) {
    terrain = "forest";
  } else {
    terrain = "grass";
  }

  let resourceType: ResourceType = "none";
  const r = hash2(x, y, seed + 777);
  if (terrain === "mountain" && r > 0.5) resourceType = "ore";
  else if (terrain === "forest" && r > 0.62) resourceType = "wood";
  else if (terrain === "grass" && r > 0.88) resourceType = "wood";
  else if (terrain === "desert" && r > 0.8) resourceType = "stone";
  else if (terrain === "mountain" && r > 0.35) resourceType = "stone";

  return { x, y, isLand: true, terrain, resourceType };
}

export function chunkCoords(
  x: number,
  y: number,
): { cx: number; cy: number; lx: number; ly: number } {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const lx = x - cx * CHUNK_SIZE;
  const ly = y - cy * CHUNK_SIZE;
  return { cx, cy, lx, ly };
}
