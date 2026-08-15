import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { normalizeBubble, normalizePlayerEmoji } from "@/lib/game/playerStyle";
import { isOnlineFromLastSeen } from "@/lib/game/presence";
import { settleOutstandingTravel } from "@/lib/game/travel";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

/** All players on the current map (public fields only). */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await ensureDefaultMap(db);
    const world = await getPlayerWorld(db, Number(session.user.id));

    // Catch up offline travelers so the directory doesn't show stuck "moving".
    await settleOutstandingTravel(db);

    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        emoji: players.emoji,
        bubble: players.bubble,
        x: players.x,
        y: players.y,
        status: players.status,
        xp: players.xp,
        gold: players.gold,
        lastSeenAt: players.lastSeenAt,
        createdAt: players.createdAt,
      })
      .from(players)
      .where(eq(players.currentMapId, world.id))
      .orderBy(asc(players.name));

    return NextResponse.json({
      players: rows.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: normalizePlayerEmoji(p.emoji),
        bubble: normalizeBubble(p.bubble),
        x: p.x,
        y: p.y,
        status: p.status,
        xp: p.xp,
        gold: p.gold,
        online: isOnlineFromLastSeen(p.lastSeenAt),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/players]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
