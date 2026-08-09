import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { players } from "@/lib/db/schema";
import { listOnlineOnMap, touchLastSeen } from "@/lib/game/presence";
import { normalizePlayerEmoji } from "@/lib/game/playerStyle";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const db = getDb();
    await ensureDefaultMap(db);
    await touchLastSeen(db, playerId);

    const me = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!me) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const world = await getPlayerWorld(db, playerId);
    const others = await listOnlineOnMap(db, world.id, playerId);

    const list = [
      {
        id: me.id,
        name: me.name,
        emoji: normalizePlayerEmoji(me.emoji),
        x: me.x,
        y: me.y,
        status: me.status,
        isSelf: true as const,
      },
      ...others.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: normalizePlayerEmoji(p.emoji),
        x: p.x,
        y: p.y,
        status: p.status,
        isSelf: false as const,
      })),
    ];

    return NextResponse.json({ players: list });
  } catch (err) {
    console.error("[api/players/online]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
