import { MAP_SIZE } from "@/lib/map/constants";

export type Point = { x: number; y: number };

export function clampToMap(x: number, y: number): Point {
  return {
    x: Math.max(0, Math.min(MAP_SIZE - 1, Math.round(x))),
    y: Math.max(0, Math.min(MAP_SIZE - 1, Math.round(y))),
  };
}

/** 4-directional path (Manhattan). */
export function buildPath(from: Point, to: Point): Point[] {
  const path: Point[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    path.push({ x, y });
  }
  return path;
}

/** 8-directional path: each step moves by (dx, dy). Diagonal counts as 1 tile. */
export function buildDirectionalPath(
  from: Point,
  dx: number,
  dy: number,
  steps: number,
): Point[] {
  const path: Point[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  for (let i = 0; i < steps; i++) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) break;
    x = nx;
    y = ny;
    path.push({ x, y });
  }
  return path;
}
