import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { maps, players } from "@/lib/db/schema";
import { MAP_SIZE, WORLD_SEED } from "@/lib/map/constants";

/** Bootstrap / legacy default world. */
export const DEFAULT_MAP_ID = 1;
export const DEFAULT_MAP_SLUG = "horizon";

export type WorldMap = {
  id: number;
  slug: string;
  name: string;
  seed: number;
  size: number;
};

/** Ensure map id=1 exists (current single world). Safe to call repeatedly. */
export async function ensureDefaultMap(db: Db): Promise<WorldMap> {
  const existing = await db.query.maps.findFirst({
    where: eq(maps.id, DEFAULT_MAP_ID),
  });
  if (existing) {
    return {
      id: existing.id,
      slug: existing.slug,
      name: existing.name,
      seed: existing.seed,
      size: existing.size,
    };
  }

  const inserted = await db
    .insert(maps)
    .values({
      id: DEFAULT_MAP_ID,
      slug: DEFAULT_MAP_SLUG,
      name: "Gridhorizon",
      seed: WORLD_SEED,
      size: MAP_SIZE,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) {
    return {
      id: inserted[0].id,
      slug: inserted[0].slug,
      name: inserted[0].name,
      seed: inserted[0].seed,
      size: inserted[0].size,
    };
  }

  const again = await db.query.maps.findFirst({
    where: eq(maps.id, DEFAULT_MAP_ID),
  });
  if (!again) {
    throw new Error("Failed to ensure default map");
  }
  return {
    id: again.id,
    slug: again.slug,
    name: again.name,
    seed: again.seed,
    size: again.size,
  };
}

export async function getMapById(
  db: Db,
  mapId: number,
): Promise<WorldMap | null> {
  const row = await db.query.maps.findFirst({
    where: eq(maps.id, mapId),
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    seed: row.seed,
    size: row.size,
  };
}

/** Player's current map row; falls back to default map. */
export async function getPlayerWorld(
  db: Db,
  playerId: number,
): Promise<WorldMap> {
  await ensureDefaultMap(db);
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  const mapId = player?.currentMapId ?? DEFAULT_MAP_ID;
  const map = await getMapById(db, mapId);
  if (map) return map;
  return (await getMapById(db, DEFAULT_MAP_ID))!;
}
