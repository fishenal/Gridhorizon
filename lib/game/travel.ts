import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  buildings,
  players,
  travelJobs,
  waypointPasses,
} from "@/lib/db/schema";
import {
  MAP_SIZE,
  MAX_TRAVEL_STEPS,
  TRAVEL_SECONDS_PER_TILE,
  VISION_RADIUS,
  WAYPOINT_TOLL,
} from "@/lib/map/constants";
import { markExploredCells, shareExploration } from "@/lib/map/explore";
import {
  buildDirectionalPath,
  buildPath,
  clampToMap,
  type Point,
} from "@/lib/game/path";
import { DEFAULT_MAP_ID } from "@/lib/map/world";

export type { Point } from "@/lib/game/path";
export { buildDirectionalPath, buildPath, clampToMap } from "@/lib/game/path";

function cellsInVision(cx: number, cy: number): Point[] {
  const cells: Point[] = [];
  const r2 = VISION_RADIUS * VISION_RADIUS;
  for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy++) {
    for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Sample vision disks along the path segment so fog covers the corridor
 * without expanding a full disk on every tile (O(steps) → O(steps/r)).
 */
function collectExploredAlongPath(
  path: Point[],
  fromIndex: number,
  toIndex: number,
): Point[] {
  if (toIndex <= fromIndex) return [];
  const sampleEvery = Math.max(1, VISION_RADIUS);
  const seen = new Set<string>();
  const cells: Point[] = [];

  const addVision = (cx: number, cy: number) => {
    for (const cell of cellsInVision(cx, cy)) {
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  };

  for (let i = fromIndex + 1; i <= toIndex; i++) {
    if (i === toIndex || (i - fromIndex) % sampleEvery === 0) {
      const cell = path[i]!;
      addVision(cell.x, cell.y);
    }
  }
  return cells;
}

/** Batch waypoint tolls for cells entered this settle (one bbox query). */
async function settleWaypointsOnSegment(
  db: Db,
  playerId: number,
  mapId: number,
  segment: Point[],
): Promise<void> {
  if (segment.length === 0) return;

  let minX = segment[0]!.x;
  let maxX = segment[0]!.x;
  let minY = segment[0]!.y;
  let maxY = segment[0]!.y;
  for (const p of segment) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const waypoints = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.mapId, mapId),
        eq(buildings.type, "waypoint"),
        gte(buildings.x, minX),
        lte(buildings.x, maxX),
        gte(buildings.y, minY),
        lte(buildings.y, maxY),
      ),
    );
  if (waypoints.length === 0) return;

  const byCell = new Map<string, (typeof waypoints)[number]>();
  for (const wp of waypoints) {
    byCell.set(`${wp.x},${wp.y}`, wp);
  }

  const hitOrder: Array<(typeof waypoints)[number]> = [];
  const hitIds = new Set<number>();
  for (const cell of segment) {
    const wp = byCell.get(`${cell.x},${cell.y}`);
    if (!wp || wp.ownerId === playerId || hitIds.has(wp.id)) continue;
    hitIds.add(wp.id);
    hitOrder.push(wp);
  }
  if (hitOrder.length === 0) return;

  const hitBuildingIds = hitOrder.map((wp) => wp.id);
  const existingPasses = await db
    .select()
    .from(waypointPasses)
    .where(
      and(
        eq(waypointPasses.playerId, playerId),
        inArray(waypointPasses.buildingId, hitBuildingIds),
      ),
    );
  const passed = new Set(existingPasses.map((p) => p.buildingId));

  const traveler = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!traveler) return;

  let gold = traveler.gold;
  const ownerGains = new Map<number, number>();

  for (const wp of hitOrder) {
    if (passed.has(wp.id)) continue;
    if (gold < WAYPOINT_TOLL) break;
    gold -= WAYPOINT_TOLL;
    ownerGains.set(wp.ownerId, (ownerGains.get(wp.ownerId) ?? 0) + WAYPOINT_TOLL);
    await db.insert(waypointPasses).values({
      playerId,
      buildingId: wp.id,
    });
    await shareExploration(db, wp.ownerId, playerId, mapId);
  }

  if (gold !== traveler.gold) {
    await db
      .update(players)
      .set({ gold })
      .where(eq(players.id, playerId));
  }
  for (const [ownerId, gain] of ownerGains) {
    await db
      .update(players)
      .set({ gold: sql`${players.gold} + ${gain}` })
      .where(eq(players.id, ownerId));
  }
}

/**
 * Catch up travel by elapsed time: jump pathIndex (O(1) pose/gold),
 * batch waypoints, sample exploration along the corridor.
 * Mid-stop remains client stopTravel; incomplete jobs keep remaining path.
 */
export async function settleTravel(db: Db, playerId: number): Promise<void> {
  const job = await db.query.travelJobs.findFirst({
    where: eq(travelJobs.playerId, playerId),
  });
  if (!job) return;

  const mapId = job.mapId ?? DEFAULT_MAP_ID;
  const path = JSON.parse(job.pathJson) as Point[];
  if (path.length === 0) {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
    await db
      .update(players)
      .set({ status: "idle" })
      .where(eq(players.id, playerId));
    return;
  }

  const now = Date.now();
  const last = new Date(job.lastSettledAt).getTime();
  const elapsed = Math.max(0, now - last);
  const steps = Math.floor(elapsed / (TRAVEL_SECONDS_PER_TILE * 1000));
  if (steps <= 0) return;

  const fromIndex = job.pathIndex;
  const maxAdvance = Math.max(0, path.length - 1 - fromIndex);
  const advance = Math.min(steps, maxAdvance);
  if (advance <= 0) return;

  const toIndex = fromIndex + advance;
  const segment = path.slice(fromIndex + 1, toIndex + 1);
  const pos = path[toIndex]!;
  const goldGain = advance;

  const settledMs = last + advance * TRAVEL_SECONDS_PER_TILE * 1000;
  const finished = toIndex >= path.length - 1;

  await settleWaypointsOnSegment(db, playerId, mapId, segment);
  await markExploredCells(
    db,
    playerId,
    collectExploredAlongPath(path, fromIndex, toIndex),
    mapId,
  );

  await db
    .update(players)
    .set({
      x: pos.x,
      y: pos.y,
      gold: sql`${players.gold} + ${goldGain}`,
      ...(finished ? { status: "idle" as const } : {}),
    })
    .where(eq(players.id, playerId));

  if (finished) {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
  } else {
    await db
      .update(travelJobs)
      .set({
        pathIndex: toIndex,
        lastSettledAt: new Date(settledMs),
      })
      .where(eq(travelJobs.id, job.id));
  }
}

export async function startTravel(
  db: Db,
  playerId: number,
  targetX: number,
  targetY: number,
): Promise<
  { ok: true; steps: number; etaSeconds: number } | { ok: false; error: string }
> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  await settleTravel(db, playerId);

  const refreshed = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!refreshed) return { ok: false, error: "Player not found" };

  const mapId = refreshed.currentMapId ?? DEFAULT_MAP_ID;
  const to = clampToMap(targetX, targetY);
  if (to.x === refreshed.x && to.y === refreshed.y) {
    return { ok: false, error: "Already there" };
  }

  const path = buildPath({ x: refreshed.x, y: refreshed.y }, to);
  const steps = path.length - 1;
  const now = new Date();

  await db.delete(travelJobs).where(eq(travelJobs.playerId, playerId));
  await db.insert(travelJobs).values({
    playerId,
    mapId,
    pathJson: JSON.stringify(path),
    pathIndex: 0,
    startedAt: now,
    lastSettledAt: now,
  });
  await db
    .update(players)
    .set({ status: "traveling" })
    .where(eq(players.id, playerId));

  await markExploredCells(
    db,
    playerId,
    cellsInVision(refreshed.x, refreshed.y),
    mapId,
  );

  return {
    ok: true,
    steps,
    etaSeconds: steps * TRAVEL_SECONDS_PER_TILE,
  };
}

export async function startDirectionalTravel(
  db: Db,
  playerId: number,
  dx: number,
  dy: number,
  steps: number,
): Promise<
  { ok: true; steps: number; etaSeconds: number } | { ok: false; error: string }
> {
  if (dx === 0 && dy === 0) {
    return { ok: false, error: "Need a direction" };
  }
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return { ok: false, error: "Invalid direction" };
  }
  if (steps < 1 || steps > MAX_TRAVEL_STEPS) {
    return { ok: false, error: `Steps must be 1–${MAX_TRAVEL_STEPS}` };
  }

  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  await settleTravel(db, playerId);

  const refreshed = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!refreshed) return { ok: false, error: "Player not found" };

  const mapId = refreshed.currentMapId ?? DEFAULT_MAP_ID;
  const path = buildDirectionalPath(
    { x: refreshed.x, y: refreshed.y },
    dx,
    dy,
    steps,
  );
  const moved = path.length - 1;
  if (moved <= 0) {
    return { ok: false, error: "Cannot move that way (map edge)" };
  }

  const now = new Date();
  await db.delete(travelJobs).where(eq(travelJobs.playerId, playerId));
  await db.insert(travelJobs).values({
    playerId,
    mapId,
    pathJson: JSON.stringify(path),
    pathIndex: 0,
    startedAt: now,
    lastSettledAt: now,
  });
  await db
    .update(players)
    .set({ status: "traveling" })
    .where(eq(players.id, playerId));

  await markExploredCells(
    db,
    playerId,
    cellsInVision(refreshed.x, refreshed.y),
    mapId,
  );

  return {
    ok: true,
    steps: moved,
    etaSeconds: moved * TRAVEL_SECONDS_PER_TILE,
  };
}

/** Client-authoritative stop: park at (x,y), clear travel job. */
export async function stopTravel(
  db: Db,
  playerId: number,
  x: number,
  y: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  const mapId = player.currentMapId ?? DEFAULT_MAP_ID;
  const pos = clampToMap(x, y);
  await db.delete(travelJobs).where(eq(travelJobs.playerId, playerId));
  await db
    .update(players)
    .set({ x: pos.x, y: pos.y, status: "idle" })
    .where(eq(players.id, playerId));
  await markExploredCells(db, playerId, cellsInVision(pos.x, pos.y), mapId);

  return { ok: true };
}
