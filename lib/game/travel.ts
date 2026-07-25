import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  buildings,
  players,
  travelJobs,
  waypointPasses,
} from "@/lib/db/schema";
import {
  MAP_SIZE,
  TRAVEL_SECONDS_PER_TILE,
  VISION_RADIUS,
  WAYPOINT_TOLL,
} from "@/lib/map/constants";
import { markExploredCells, shareExploration } from "@/lib/map/explore";

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

async function handleWaypointAt(
  db: Db,
  playerId: number,
  x: number,
  y: number,
): Promise<void> {
  const wp = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.x, x),
      eq(buildings.y, y),
      eq(buildings.type, "waypoint"),
    ),
  });
  if (!wp || wp.ownerId === playerId) return;

  const already = await db.query.waypointPasses.findFirst({
    where: and(
      eq(waypointPasses.playerId, playerId),
      eq(waypointPasses.buildingId, wp.id),
    ),
  });
  if (already) return;

  const traveler = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!traveler || traveler.gold < WAYPOINT_TOLL) return;

  await db
    .update(players)
    .set({ gold: traveler.gold - WAYPOINT_TOLL })
    .where(eq(players.id, playerId));
  await db
    .update(players)
    .set({ gold: sql`${players.gold} + ${WAYPOINT_TOLL}` })
    .where(eq(players.id, wp.ownerId));
  await db.insert(waypointPasses).values({
    playerId,
    buildingId: wp.id,
  });
  await shareExploration(db, wp.ownerId, playerId);
}

export async function settleTravel(db: Db, playerId: number): Promise<void> {
  const job = await db.query.travelJobs.findFirst({
    where: eq(travelJobs.playerId, playerId),
  });
  if (!job) return;

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

  let index = job.pathIndex;
  let goldGain = 0;
  const exploredBatch: Point[] = [];

  for (let s = 0; s < steps && index < path.length - 1; s++) {
    index += 1;
    const cell = path[index]!;
    goldGain += 1;
    exploredBatch.push(...cellsInVision(cell.x, cell.y));
    await handleWaypointAt(db, playerId, cell.x, cell.y);
  }

  const settledMs =
    new Date(job.lastSettledAt).getTime() +
    steps * TRAVEL_SECONDS_PER_TILE * 1000;
  const pos = path[Math.min(index, path.length - 1)]!;

  if (goldGain > 0) {
    await db
      .update(players)
      .set({
        x: pos.x,
        y: pos.y,
        gold: sql`${players.gold} + ${goldGain}`,
      })
      .where(eq(players.id, playerId));
    await markExploredCells(db, playerId, exploredBatch);
  } else {
    await db
      .update(players)
      .set({ x: pos.x, y: pos.y })
      .where(eq(players.id, playerId));
  }

  if (index >= path.length - 1) {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
    await db
      .update(players)
      .set({ status: "idle", x: pos.x, y: pos.y })
      .where(eq(players.id, playerId));
  } else {
    await db
      .update(travelJobs)
      .set({
        pathIndex: index,
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
): Promise<{ ok: true; steps: number; etaSeconds: number } | { ok: false; error: string }> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  await settleTravel(db, playerId);

  const refreshed = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!refreshed) return { ok: false, error: "Player not found" };

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
    pathJson: JSON.stringify(path),
    pathIndex: 0,
    startedAt: now,
    lastSettledAt: now,
  });
  await db
    .update(players)
    .set({ status: "traveling" })
    .where(eq(players.id, playerId));

  // Reveal around start
  await markExploredCells(db, playerId, cellsInVision(refreshed.x, refreshed.y));

  return {
    ok: true,
    steps,
    etaSeconds: steps * TRAVEL_SECONDS_PER_TILE,
  };
}
