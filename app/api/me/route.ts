import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { players, travelJobs } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { TRAVEL_SECONDS_PER_TILE, VISION_RADIUS, WORLD_SEED } from "@/lib/map/constants";
import { listFriends } from "@/lib/game/social";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const db = getDb();
    await settlePlayer(db, playerId);

    const player = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!player) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const job = await db.query.travelJobs.findFirst({
      where: eq(travelJobs.playerId, playerId),
    });

    let travel: null | {
      pathIndex: number;
      pathLength: number;
      etaSeconds: number;
      target: { x: number; y: number };
    } = null;

    if (job) {
      const path = JSON.parse(job.pathJson) as Array<{ x: number; y: number }>;
      const remaining = Math.max(0, path.length - 1 - job.pathIndex);
      travel = {
        pathIndex: job.pathIndex,
        pathLength: path.length,
        etaSeconds: remaining * TRAVEL_SECONDS_PER_TILE,
        target: path[path.length - 1]!,
      };
    }

    const friends = await listFriends(db, playerId);

    return NextResponse.json({
      player: {
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        gold: player.gold,
        xp: player.xp,
        stone: player.stone,
        wood: player.wood,
        ore: player.ore,
        food: player.food,
        status: player.status,
      },
      travel,
      friends,
      config: {
        travelSecondsPerTile: TRAVEL_SECONDS_PER_TILE,
        worldSeed: WORLD_SEED,
        visionRadius: VISION_RADIUS,
      },
    });
  } catch (err) {
    console.error("[api/me]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
