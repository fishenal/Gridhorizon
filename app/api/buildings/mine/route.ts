import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
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
    const world = await getPlayerWorld(db, playerId);

    const rows = await db
      .select({
        id: buildings.id,
        type: buildings.type,
        name: buildings.name,
        x: buildings.x,
        y: buildings.y,
        createdAt: buildings.createdAt,
      })
      .from(buildings)
      .where(
        and(eq(buildings.ownerId, playerId), eq(buildings.mapId, world.id)),
      )
      .orderBy(desc(buildings.createdAt));

    return NextResponse.json({
      buildings: rows.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        x: r.x,
        y: r.y,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/buildings/mine]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
