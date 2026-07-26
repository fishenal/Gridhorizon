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
import {
  buildDirectionalPath,
  buildPath,
  clampToMap,
  type Point,
} from "@/lib/game/path";

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

export async function startDirectionalTravel(
  db: Db,
  playerId: number,
  dx: number,
  dy: number,
  steps: number,
): Promise<{ ok: true; steps: number; etaSeconds: number } | { ok: false; error: string }> {
  if (dx === 0 && dy === 0) {
    return { ok: false, error: "Need a direction" };
  }
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return { ok: false, error: "Invalid direction" };
  }
  if (steps < 1 || steps > 500) {
    return { ok: false, error: "Steps must be 1–500" };
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
    pathJson: JSON.stringify(path),
    pathIndex: 0,
    startedAt: now,
    lastSettledAt: now,
  });
  await db
    .update(players)
    .set({ status: "traveling" })
    .where(eq(players.id, playerId));

  await markExploredCells(db, playerId, cellsInVision(refreshed.x, refreshed.y));

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

  const pos = clampToMap(x, y);
  await db.delete(travelJobs).where(eq(travelJobs.playerId, playerId));
  await db
    .update(players)
    .set({ x: pos.x, y: pos.y, status: "idle" })
    .where(eq(players.id, playerId));
  await markExploredCells(db, playerId, cellsInVision(pos.x, pos.y));

  return { ok: true };
}
