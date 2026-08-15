import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players } from "@/lib/db/schema";
import { normalizePlayerEmoji } from "@/lib/game/playerStyle";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

/** All buildings on the current map, with owner display fields. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await ensureDefaultMap(db);
    const world = await getPlayerWorld(db, Number(session.user.id));

    const rows = await db
      .select({
        id: buildings.id,
        type: buildings.type,
        name: buildings.name,
        x: buildings.x,
        y: buildings.y,
        level: buildings.level,
        ownerId: buildings.ownerId,
        ownerName: players.name,
        ownerEmoji: players.emoji,
        createdAt: buildings.createdAt,
      })
      .from(buildings)
      .innerJoin(players, eq(buildings.ownerId, players.id))
      .where(eq(buildings.mapId, world.id))
      .orderBy(asc(buildings.y), asc(buildings.x));

    return NextResponse.json({
      buildings: rows.map((b) => ({
        id: b.id,
        type: b.type,
        name: b.name,
        x: b.x,
        y: b.y,
        level: b.level,
        ownerId: b.ownerId,
        ownerName: b.ownerName,
        ownerEmoji: normalizePlayerEmoji(b.ownerEmoji),
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/buildings]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
