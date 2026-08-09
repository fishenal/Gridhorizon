import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

const LIMIT = 50;

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
        id: activityLogs.id,
        type: activityLogs.type,
        payload: activityLogs.payload,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.playerId, playerId),
          eq(activityLogs.mapId, world.id),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(LIMIT);

    return NextResponse.json({
      logs: rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: safeParsePayload(r.payload),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[api/activity]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function safeParsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}
