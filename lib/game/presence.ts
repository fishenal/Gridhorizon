import { and, asc, eq, gte, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { players } from "@/lib/db/schema";

/** Consider online if active within this window. */
export const ONLINE_WINDOW_MS = 90_000;

export function isOnlineFromLastSeen(
  lastSeenAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const t =
    lastSeenAt instanceof Date
      ? lastSeenAt.getTime()
      : new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= ONLINE_WINDOW_MS;
}

export async function touchLastSeen(db: Db, playerId: number): Promise<void> {
  await db
    .update(players)
    .set({ lastSeenAt: new Date() })
    .where(eq(players.id, playerId));
}

export async function listOnlineOnMap(
  db: Db,
  mapId: number,
  excludePlayerId?: number,
): Promise<
  Array<{
    id: number;
    name: string;
    emoji: string;
    x: number;
    y: number;
    status: string;
  }>
> {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      emoji: players.emoji,
      x: players.x,
      y: players.y,
      status: players.status,
    })
    .from(players)
    .where(
      excludePlayerId != null
        ? and(
            eq(players.currentMapId, mapId),
            gte(players.lastSeenAt, since),
            ne(players.id, excludePlayerId),
          )
        : and(
            eq(players.currentMapId, mapId),
            gte(players.lastSeenAt, since),
          ),
    )
    .orderBy(asc(players.name));

  return rows;
}
