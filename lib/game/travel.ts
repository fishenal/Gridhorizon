import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { buildings, players, travelJobs } from "@/lib/db/schema";
import {
  MAP_SIZE,
  MAX_TRAVEL_STEPS,
  TRAVEL_SECONDS_PER_TILE,
  VISION_RADIUS,
} from "@/lib/map/constants";
import { markExploredCells, shareExploration } from "@/lib/map/explore";
import {
  buildDirectionalPath,
  buildPath,
  clampToMap,
  type Point,
} from "@/lib/game/path";
import { DEFAULT_MAP_ID } from "@/lib/map/world";
import {
  logTollPaid,
  logTollReceived,
  logTravelArrive,
  logTravelStart,
  logTravelStop,
} from "@/lib/game/activityLog";
import {
  defaultTollAmount,
  defaultTollRadius,
  findTollEntries,
  type TollStructure,
} from "@/lib/game/structureToll";
import { xpForSteps, xpForToll } from "@/lib/game/xp";

export type { Point } from "@/lib/game/path";
export { buildDirectionalPath, buildPath, clampToMap } from "@/lib/game/path";

export type StopReason = "manual" | "arrived";

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

const TOLL_STRUCTURE_TYPES = ["flag", "town", "waypoint"] as const;

/**
 * Charge influence tolls for outside→inside transitions on this segment.
 * Re-entry after leaving charges again; continuous stay does not.
 */
async function settleStructureTollsOnSegment(
  db: Db,
  playerId: number,
  mapId: number,
  segment: Point[],
  previous: Point | null,
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
  if (previous) {
    minX = Math.min(minX, previous.x);
    maxX = Math.max(maxX, previous.x);
    minY = Math.min(minY, previous.y);
    maxY = Math.max(maxY, previous.y);
  }

  const pad = defaultTollRadius(null);
  const candidates = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.mapId, mapId),
        inArray(buildings.type, [...TOLL_STRUCTURE_TYPES]),
        gte(buildings.x, minX - pad),
        lte(buildings.x, maxX + pad),
        gte(buildings.y, minY - pad),
        lte(buildings.y, maxY + pad),
      ),
    );
  if (candidates.length === 0) return;

  const structures: TollStructure[] = candidates.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    radius: defaultTollRadius(b.tollRadius),
    ownerId: b.ownerId,
    type: b.type,
    name: b.name,
    amount: defaultTollAmount(b.tollAmount, b.type),
  }));

  const entries = findTollEntries(previous, segment, structures, playerId);
  if (entries.length === 0) return;

  const traveler = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!traveler) return;

  const ownerIds = [...new Set(entries.map((e) => e.structure.ownerId))];
  const ownerRows =
    ownerIds.length > 0
      ? await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, ownerIds))
      : [];
  const ownerNameById = new Map(ownerRows.map((o) => [o.id, o.name]));

  let gold = traveler.gold;
  const ownerGains = new Map<number, number>();
  let travelerTollXp = 0;
  const ownerXpGains = new Map<number, number>();

  for (const { structure: b, at } of entries) {
    const amount = b.amount;
    if (amount <= 0) continue;
    if (gold < amount) break;

    gold -= amount;
    ownerGains.set(b.ownerId, (ownerGains.get(b.ownerId) ?? 0) + amount);
    const tollXp = xpForToll(amount);
    travelerTollXp += tollXp;
    ownerXpGains.set(
      b.ownerId,
      (ownerXpGains.get(b.ownerId) ?? 0) + tollXp,
    );
    await shareExploration(db, b.ownerId, playerId, mapId);

    const ownerName = ownerNameById.get(b.ownerId) ?? "Unknown";
    await logTollPaid(db, playerId, mapId, {
      amount,
      buildingType: b.type,
      buildingName: b.name,
      buildingId: b.id,
      ownerId: b.ownerId,
      ownerName,
      at,
    });
    await logTollReceived(db, b.ownerId, mapId, {
      amount,
      buildingType: b.type,
      buildingName: b.name,
      buildingId: b.id,
      fromPlayerId: playerId,
      fromPlayerName: traveler.name,
      at,
    });
  }

  if (gold !== traveler.gold || travelerTollXp > 0) {
    await db
      .update(players)
      .set({
        ...(gold !== traveler.gold ? { gold } : {}),
        ...(travelerTollXp > 0
          ? { xp: sql`${players.xp} + ${travelerTollXp}` }
          : {}),
      })
      .where(eq(players.id, playerId));
  }
  const ownerIdsSettled = new Set([
    ...ownerGains.keys(),
    ...ownerXpGains.keys(),
  ]);
  for (const ownerId of ownerIdsSettled) {
    const gain = ownerGains.get(ownerId) ?? 0;
    const xpGain = ownerXpGains.get(ownerId) ?? 0;
    await db
      .update(players)
      .set({
        ...(gain > 0 ? { gold: sql`${players.gold} + ${gain}` } : {}),
        ...(xpGain > 0 ? { xp: sql`${players.xp} + ${xpGain}` } : {}),
      })
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
  if (!job) {
    // Orphan status: traveling with no job (closed tab / interrupted settle).
    await db
      .update(players)
      .set({ status: "idle" })
      .where(and(eq(players.id, playerId), eq(players.status, "traveling")));
    return;
  }

  const mapId = job.mapId ?? DEFAULT_MAP_ID;
  const path = JSON.parse(job.pathJson) as Point[];

  const finishJob = async (pos: Point) => {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
    await db
      .update(players)
      .set({ status: "idle", x: pos.x, y: pos.y })
      .where(eq(players.id, playerId));
  };

  if (path.length === 0) {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
    await db
      .update(players)
      .set({ status: "idle" })
      .where(eq(players.id, playerId));
    return;
  }

  // Already at (or past) destination — clear stuck traveling.
  if (job.pathIndex >= path.length - 1) {
    const pos = path[path.length - 1]!;
    await finishJob(pos);
    await logTravelArrive(db, playerId, mapId, {
      at: pos,
      from: path[0],
      to: path[path.length - 1],
    });
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
  const pos = path[toIndex]!;
  const goldGain = advance;
  const xpGain = xpForSteps(advance);
  const segment = path.slice(fromIndex + 1, toIndex + 1);

  const settledMs = last + advance * TRAVEL_SECONDS_PER_TILE * 1000;
  const finished = toIndex >= path.length - 1;

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
      xp: sql`${players.xp} + ${xpGain}`,
      ...(finished ? { status: "idle" as const } : {}),
    })
    .where(eq(players.id, playerId));

  await settleStructureTollsOnSegment(
    db,
    playerId,
    mapId,
    segment,
    path[fromIndex] ?? null,
  );

  if (finished) {
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
    await logTravelArrive(db, playerId, mapId, {
      at: pos,
      from: path[0],
      to: path[path.length - 1],
    });
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

/**
 * Advance all open travel jobs and clear orphan `traveling` statuses.
 * Safe to call from list endpoints / cron.
 */
export async function settleOutstandingTravel(db: Db): Promise<number> {
  const jobs = await db
    .select({ playerId: travelJobs.playerId })
    .from(travelJobs);
  for (const row of jobs) {
    await settleTravel(db, row.playerId);
  }

  // Players marked traveling with no remaining job.
  const stillTraveling = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.status, "traveling"));
  let orphans = 0;
  for (const row of stillTraveling) {
    const job = await db.query.travelJobs.findFirst({
      where: eq(travelJobs.playerId, row.id),
    });
    if (!job) {
      await db
        .update(players)
        .set({ status: "idle" })
        .where(eq(players.id, row.id));
      orphans += 1;
    }
  }

  return jobs.length + orphans;
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

  await logTravelStart(db, playerId, mapId, {
    from: { x: refreshed.x, y: refreshed.y },
    to,
    steps,
  });

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

  await logTravelStart(db, playerId, mapId, {
    from: { x: refreshed.x, y: refreshed.y },
    to: path[path.length - 1]!,
    steps: moved,
  });

  return {
    ok: true,
    steps: moved,
    etaSeconds: moved * TRAVEL_SECONDS_PER_TILE,
  };
}

/** Client-authoritative stop: settle travel gold first, then park at (x,y). */
export async function stopTravel(
  db: Db,
  playerId: number,
  x: number,
  y: number,
  reason: StopReason = "manual",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  // Award gold + XP per time-elapsed step before clearing the job
  await settleTravel(db, playerId);

  const mapId = player.currentMapId ?? DEFAULT_MAP_ID;
  const pos = clampToMap(x, y);

  const job = await db.query.travelJobs.findFirst({
    where: eq(travelJobs.playerId, playerId),
  });

  let extraSteps = 0;
  let pathFrom: Point | undefined;
  let pathTo: Point | undefined;
  let tollSegment: Point[] = [];
  let tollPrevious: Point | null = null;
  if (job) {
    const path = JSON.parse(job.pathJson) as Point[];
    pathFrom = path[0];
    pathTo = path[path.length - 1];
    let stopIdx = -1;
    for (let i = job.pathIndex; i < path.length; i++) {
      const cell = path[i]!;
      if (cell.x === pos.x && cell.y === pos.y) {
        stopIdx = i;
        break;
      }
    }
    if (stopIdx >= 0) {
      extraSteps = Math.max(0, stopIdx - job.pathIndex);
      tollSegment = path.slice(job.pathIndex + 1, stopIdx + 1);
      tollPrevious = path[job.pathIndex] ?? null;
    }
    await db.delete(travelJobs).where(eq(travelJobs.id, job.id));
  }

  const extraXp = xpForSteps(extraSteps);
  await db
    .update(players)
    .set({
      x: pos.x,
      y: pos.y,
      status: "idle",
      ...(extraSteps > 0
        ? {
            gold: sql`${players.gold} + ${extraSteps}`,
            xp: sql`${players.xp} + ${extraXp}`,
          }
        : {}),
    })
    .where(eq(players.id, playerId));
  await markExploredCells(db, playerId, cellsInVision(pos.x, pos.y), mapId);
  await settleStructureTollsOnSegment(
    db,
    playerId,
    mapId,
    tollSegment,
    tollPrevious,
  );

  // If settleTravel already finished the path, it logged arrive — skip here.
  if (job) {
    const endPayload = { at: pos, from: pathFrom, to: pathTo };
    if (reason === "arrived") {
      await logTravelArrive(db, playerId, mapId, endPayload);
    } else {
      await logTravelStop(db, playerId, mapId, endPayload);
    }
  }

  return { ok: true };
}
