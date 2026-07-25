import { CHUNK_SIZE, MAP_SIZE, WORLD_SEED } from "./constants";

export type Terrain = "ocean" | "plain" | "mountain" | "snow" | "coast";
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

function elevation(x: number, y: number, seed: number): number {
  const n1 = smoothNoise(x, y, seed, 180);
  const n2 = smoothNoise(x, y, seed + 17, 64) * 0.45;
  const n3 = smoothNoise(x, y, seed + 91, 24) * 0.2;
  return n1 + n2 + n3;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

function isLandAt(x: number, y: number, seed: number): boolean {
  if (!inBounds(x, y)) return false;
  // ~1/3 land: threshold tuned around 0.58 on combined noise
  return elevation(x, y, seed) > 0.58;
}

function hasOceanNeighbor(x: number, y: number, seed: number): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny) || !isLandAt(nx, ny, seed)) return true;
  }
  return false;
}

export function generateTile(
  x: number,
  y: number,
  seed: number = WORLD_SEED,
): TileInfo {
  if (!inBounds(x, y)) {
    return { x, y, isLand: false, terrain: "ocean", resourceType: "none" };
  }

  const land = isLandAt(x, y, seed);
  if (!land) {
    return { x, y, isLand: false, terrain: "ocean", resourceType: "none" };
  }

  const elev = elevation(x, y, seed);
  const moist = smoothNoise(x, y, seed + 200, 90);
  const coast = hasOceanNeighbor(x, y, seed);

  let terrain: Terrain = "plain";
  if (elev > 0.82) terrain = "mountain";
  else if (moist < 0.32 && elev > 0.7) terrain = "snow";
  else if (coast) terrain = "coast";
  else terrain = "plain";

  let resourceType: ResourceType = "none";
  const r = hash2(x, y, seed + 777);
  if (terrain === "mountain" && r > 0.55) resourceType = "ore";
  else if (terrain === "plain" && r > 0.72) resourceType = "wood";
  else if ((terrain === "plain" || terrain === "coast") && r > 0.85)
    resourceType = "stone";
  else if (terrain === "snow" && r > 0.7) resourceType = "stone";

  return { x, y, isLand: true, terrain, resourceType };
}

export function chunkCoords(x: number, y: number): { cx: number; cy: number; lx: number; ly: number } {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const lx = x - cx * CHUNK_SIZE;
  const ly = y - cy * CHUNK_SIZE;
  return { cx, cy, lx, ly };
}
