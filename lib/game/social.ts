import { and, eq, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { friendships, players } from "@/lib/db/schema";
import { VISION_RADIUS } from "@/lib/map/constants";

function pairIds(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export async function ensureFriendship(
  db: Db,
  a: number,
  b: number,
): Promise<void> {
  if (a === b) return;
  const [playerAId, playerBId] = pairIds(a, b);
  const existing = await db.query.friendships.findFirst({
    where: and(
      eq(friendships.playerAId, playerAId),
      eq(friendships.playerBId, playerBId),
    ),
  });
  if (existing) return;
  await db.insert(friendships).values({ playerAId, playerBId });
}

export async function autoFriendNearby(
  db: Db,
  playerId: number,
): Promise<void> {
  const me = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!me) return;

  const r = VISION_RADIUS;
  const nearby = await db
    .select()
    .from(players)
    .where(
      and(
        ne(players.id, playerId),
        sql`${players.x} BETWEEN ${me.x - r} AND ${me.x + r}`,
        sql`${players.y} BETWEEN ${me.y - r} AND ${me.y + r}`,
      ),
    );

  for (const other of nearby) {
    const dx = other.x - me.x;
    const dy = other.y - me.y;
    if (dx * dx + dy * dy <= r * r) {
      await ensureFriendship(db, playerId, other.id);
    }
  }
}

export async function listFriends(db: Db, playerId: number) {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      or(
        eq(friendships.playerAId, playerId),
        eq(friendships.playerBId, playerId),
      ),
    );

  const ids = rows.map((r) =>
    r.playerAId === playerId ? r.playerBId : r.playerAId,
  );
  if (ids.length === 0) return [];

  const friendPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      x: players.x,
      y: players.y,
    })
    .from(players)
    .where(
      sql`${players.id} IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  return friendPlayers;
}
