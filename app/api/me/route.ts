import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { players, travelJobs } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { touchLastSeen } from "@/lib/game/presence";
import { TRAVEL_SECONDS_PER_TILE, VISION_RADIUS } from "@/lib/map/constants";
import { listFriends } from "@/lib/game/social";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";
import { normalizeBubble, normalizePlayerEmoji } from "@/lib/game/playerStyle";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const db = getDb();
    await ensureDefaultMap(db);
    await settlePlayer(db, playerId);
    await touchLastSeen(db, playerId);

    const player = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!player) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const world = await getPlayerWorld(db, playerId);

    const job = await db.query.travelJobs.findFirst({
      where: eq(travelJobs.playerId, playerId),
    });

    let travel: null | {
      pathIndex: number;
      pathLength: number;
      path: Array<{ x: number; y: number }>;
      etaSeconds: number;
      origin: { x: number; y: number };
      target: { x: number; y: number };
    } = null;

    if (job) {
      const path = JSON.parse(job.pathJson) as Array<{ x: number; y: number }>;
      if (path.length >= 2 && job.pathIndex < path.length - 1) {
        const remaining = Math.max(0, path.length - 1 - job.pathIndex);
        travel = {
          pathIndex: job.pathIndex,
          pathLength: path.length,
          path,
          etaSeconds: remaining * TRAVEL_SECONDS_PER_TILE,
          origin: path[0]!,
          target: path[path.length - 1]!,
        };
      }
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
        emoji: normalizePlayerEmoji(player.emoji),
        bubble: normalizeBubble(player.bubble),
        currentMapId: world.id,
      },
      travel,
      friends,
      map: {
        id: world.id,
        slug: world.slug,
        name: world.name,
        seed: world.seed,
        size: world.size,
      },
      config: {
        travelSecondsPerTile: TRAVEL_SECONDS_PER_TILE,
        worldSeed: world.seed,
        visionRadius: VISION_RADIUS,
      },
    });
  } catch (err) {
    console.error("[api/me]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
