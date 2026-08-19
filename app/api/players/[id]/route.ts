import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players } from "@/lib/db/schema";
import { normalizeBubble, normalizePlayerEmoji } from "@/lib/game/playerStyle";
import { isOnlineFromLastSeen } from "@/lib/game/presence";
import { countExploredCells } from "@/lib/map/explore";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetId = Number((await ctx.params).id);
    if (!Number.isFinite(targetId) || targetId < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const db = getDb();
    await ensureDefaultMap(db);
    const world = await getPlayerWorld(db, Number(session.user.id));

    const player = await db.query.players.findFirst({
      where: eq(players.id, targetId),
    });
    if (!player || player.currentMapId !== world.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rows = await db
      .select({
        id: buildings.id,
        type: buildings.type,
        name: buildings.name,
        x: buildings.x,
        y: buildings.y,
        level: buildings.level,
        createdAt: buildings.createdAt,
      })
      .from(buildings)
      .where(
        and(eq(buildings.ownerId, targetId), eq(buildings.mapId, world.id)),
      )
      .orderBy(desc(buildings.createdAt));

    const exploredCells = await countExploredCells(db, targetId, world.id);

    return NextResponse.json({
      player: {
        id: player.id,
        name: player.name,
        emoji: normalizePlayerEmoji(player.emoji),
        bubble: normalizeBubble(player.bubble),
        x: player.x,
        y: player.y,
        status: player.status,
        online: isOnlineFromLastSeen(player.lastSeenAt),
        xp: player.xp,
        exploredCells,
        gold: player.gold,
        stone: player.stone,
        wood: player.wood,
        food: player.food,
        population: player.ore,
      },
      buildings: rows.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        x: r.x,
        y: r.y,
        level: r.level,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/players/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
