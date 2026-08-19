import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { BUILDING_NAME_MAX } from "@/lib/game/buildingName";
import { getDb } from "@/lib/db";
import { buildings } from "@/lib/db/schema";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(BUILDING_NAME_MAX),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const { id: rawId } = await context.params;
    const buildingId = Number(rawId);
    if (!Number.isFinite(buildingId) || buildingId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const db = getDb();
    await ensureDefaultMap(db);
    const world = await getPlayerWorld(db, playerId);

    const row = await db.query.buildings.findFirst({
      where: and(
        eq(buildings.id, buildingId),
        eq(buildings.mapId, world.id),
      ),
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.ownerId !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const name = parsed.data.name;
    await db
      .update(buildings)
      .set({ name, message: name })
      .where(eq(buildings.id, buildingId));

    return NextResponse.json({ ok: true, id: buildingId, name });
  } catch (err) {
    console.error("[api/buildings/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
