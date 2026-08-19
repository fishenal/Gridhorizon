import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { buildings, players, workJobs } from "@/lib/db/schema";
import {
  WORK_GOLD_PER_MINUTE,
  WORK_OWNER_GRANT,
} from "@/lib/map/constants";
import { DEFAULT_MAP_ID } from "@/lib/map/world";
import {
  defaultTollRadius,
  isInStructureRange,
  findTollEntries,
  type TollStructure,
} from "@/lib/game/structureToll";
import {
  isWorkplaceType,
} from "@/lib/game/structureSpacing";
import { stopTravel } from "@/lib/game/travel";
import {
  workResourceForType,
  type WorkJobView,
  type WorkResource,
  type WorkplaceWorker,
} from "@/lib/game/workplaceMeta";

export type { WorkJobView, WorkResource, WorkplaceWorker };

/** Reuse toll zone enter detection for workplaces (no gold charge). */
export function findWorkplaceEntries(
  previous: { x: number; y: number } | null,
  segment: Array<{ x: number; y: number }>,
  structures: TollStructure[],
  travelerId: number,
) {
  return findTollEntries(previous, segment, structures, travelerId);
}

async function loadWorkplaceBuilding(db: Db, buildingId: number) {
  const building = await db.query.buildings.findFirst({
    where: eq(buildings.id, buildingId),
  });
  if (!building || !isWorkplaceType(building.type)) return null;
  return { ...building, type: building.type };
}

export async function getWorkJobView(
  db: Db,
  playerId: number,
): Promise<WorkJobView | null> {
  const job = await db.query.workJobs.findFirst({
    where: eq(workJobs.playerId, playerId),
  });
  if (!job) return null;
  const building = await loadWorkplaceBuilding(db, job.buildingId);
  if (!building) {
    await db.delete(workJobs).where(eq(workJobs.id, job.id));
    return null;
  }
  const owner = await db.query.players.findFirst({
    where: eq(players.id, building.ownerId),
  });
  return {
    buildingId: building.id,
    buildingType: building.type,
    buildingName: building.name,
    ownerId: building.ownerId,
    ownerName: owner?.name ?? "Unknown",
    x: building.x,
    y: building.y,
    radius: defaultTollRadius(building.tollRadius),
    startedAt: job.startedAt.toISOString(),
  };
}

export async function listWorkplaceWorkers(
  db: Db,
  buildingId: number,
): Promise<WorkplaceWorker[]> {
  const rows = await db
    .select({
      playerId: workJobs.playerId,
      startedAt: workJobs.startedAt,
      name: players.name,
      emoji: players.emoji,
    })
    .from(workJobs)
    .innerJoin(players, eq(players.id, workJobs.playerId))
    .where(eq(workJobs.buildingId, buildingId));
  return rows.map((r) => ({
    playerId: r.playerId,
    name: r.name,
    emoji: r.emoji,
    startedAt: r.startedAt.toISOString(),
  }));
}

/**
 * Pay accrued wage minutes. If the worker left the zone (or building gone),
 * finish the job after paying.
 */
export async function settleWork(db: Db, playerId: number): Promise<void> {
  const job = await db.query.workJobs.findFirst({
    where: eq(workJobs.playerId, playerId),
  });
  if (!job) return;

  const building = await loadWorkplaceBuilding(db, job.buildingId);
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!building || !player) {
    await db.delete(workJobs).where(eq(workJobs.id, job.id));
    return;
  }

  const radius = defaultTollRadius(building.tollRadius);
  const inRange = isInStructureRange(
    player.x,
    player.y,
    building.x,
    building.y,
    radius,
  );

  const now = Date.now();
  const last = new Date(job.lastSettledAt).getTime();
  const minutes = Math.floor(Math.max(0, now - last) / 60_000);

  if (minutes > 0 && WORK_GOLD_PER_MINUTE > 0) {
    const goldGain = minutes * WORK_GOLD_PER_MINUTE;
    const settledAt = new Date(last + minutes * 60_000);
    await db
      .update(players)
      .set({ gold: sql`${players.gold} + ${goldGain}` })
      .where(eq(players.id, playerId));
    await db
      .update(workJobs)
      .set({ lastSettledAt: settledAt })
      .where(eq(workJobs.id, job.id));
  }

  if (!inRange) {
    await db.delete(workJobs).where(eq(workJobs.id, job.id));
  }
}

export async function stopWork(
  db: Db,
  playerId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await settleWork(db, playerId);
  await db.delete(workJobs).where(eq(workJobs.playerId, playerId));
  return { ok: true };
}

export async function startWork(
  db: Db,
  playerId: number,
  buildingId: number,
): Promise<
  | { ok: true; work: WorkJobView; ownerGrant: WorkResource }
  | { ok: false; error: string }
> {
  await settleWork(db, playerId);

  let player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return { ok: false, error: "Player not found" };

  if (player.status === "traveling") {
    const stopped = await stopTravel(
      db,
      playerId,
      player.x,
      player.y,
      "manual",
    );
    if (!stopped.ok) return { ok: false, error: stopped.error };
    player = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!player) return { ok: false, error: "Player not found" };
  }

  const building = await loadWorkplaceBuilding(db, buildingId);
  if (!building) return { ok: false, error: "Workplace not found" };
  if (building.ownerId === playerId) {
    return { ok: false, error: "Cannot work at your own workplace" };
  }

  const mapId = player.currentMapId ?? DEFAULT_MAP_ID;
  if (building.mapId !== mapId) {
    return { ok: false, error: "Workplace is on another map" };
  }

  const radius = defaultTollRadius(building.tollRadius);
  if (
    !isInStructureRange(player.x, player.y, building.x, building.y, radius)
  ) {
    return { ok: false, error: "You must be inside the workplace range" };
  }

  const resource = workResourceForType(building.type);
  if (!resource) return { ok: false, error: "Invalid workplace" };

  const existing = await db.query.workJobs.findFirst({
    where: eq(workJobs.playerId, playerId),
  });
  if (existing) {
    if (existing.buildingId === buildingId) {
      const view = await getWorkJobView(db, playerId);
      if (!view) return { ok: false, error: "Work job missing" };
      return { ok: true, work: view, ownerGrant: resource };
    }
    await stopWork(db, playerId);
  }

  const now = new Date();
  await db.insert(workJobs).values({
    playerId,
    buildingId: building.id,
    mapId,
    startedAt: now,
    lastSettledAt: now,
  });

  if (resource === "stone") {
    await db
      .update(players)
      .set({ stone: sql`${players.stone} + ${WORK_OWNER_GRANT}` })
      .where(eq(players.id, building.ownerId));
  } else if (resource === "wood") {
    await db
      .update(players)
      .set({ wood: sql`${players.wood} + ${WORK_OWNER_GRANT}` })
      .where(eq(players.id, building.ownerId));
  } else {
    await db
      .update(players)
      .set({ food: sql`${players.food} + ${WORK_OWNER_GRANT}` })
      .where(eq(players.id, building.ownerId));
  }

  const view = await getWorkJobView(db, playerId);
  if (!view) return { ok: false, error: "Failed to start work" };
  return { ok: true, work: view, ownerGrant: resource };
}
