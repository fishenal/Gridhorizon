import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadExploredSet } from "@/lib/map/explore";
import { getPlayerWorld } from "@/lib/map/world";

/** Matches max client zoom-out viewRadius. */
const MAX_VIEW_RADIUS = 80;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const db = getDb();

    const me = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!me) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const world = await getPlayerWorld(db, playerId);

    const url = new URL(req.url);
    const cx = Number(url.searchParams.get("x") ?? me.x);
    const cy = Number(url.searchParams.get("y") ?? me.y);
    const rawR = Number(url.searchParams.get("r") ?? MAX_VIEW_RADIUS);
    const r = Math.max(
      1,
      Math.min(MAX_VIEW_RADIUS, Number.isFinite(rawR) ? rawR : MAX_VIEW_RADIUS),
    );

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return NextResponse.json({ error: "Invalid coords" }, { status: 400 });
    }

    const explored = await loadExploredSet(
      db,
      playerId,
      cx - r,
      cy - r,
      cx + r,
      cy + r,
      world.id,
    );

    return NextResponse.json({
      center: { x: cx, y: cy },
      radius: r,
      mapId: world.id,
      cells: Array.from(explored),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
