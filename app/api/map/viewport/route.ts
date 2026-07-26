import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players, tileClaims } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { VISION_RADIUS, WORLD_SEED } from "@/lib/map/constants";
import { loadExploredSet } from "@/lib/map/explore";
import { generateTile } from "@/lib/map/generator";

export async function GET(req: Request) {
  try {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const playerId = Number(session.user.id);
  const db = getDb();
  await settlePlayer(db, playerId);

  const me = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!me) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const cx = Number(url.searchParams.get("x") ?? me.x);
  const cy = Number(url.searchParams.get("y") ?? me.y);
  const r = VISION_RADIUS;
  const minX = cx - r;
  const maxX = cx + r;
  const minY = cy - r;
  const maxY = cy + r;

  const explored = await loadExploredSet(db, playerId, minX, minY, maxX, maxY);

  const overlayBuildings = await db
    .select()
    .from(buildings)
    .where(
      and(
        gte(buildings.x, minX),
        lte(buildings.x, maxX),
        gte(buildings.y, minY),
        lte(buildings.y, maxY),
      ),
    );

  const claims = await db
    .select()
    .from(tileClaims)
    .where(
      and(
        gte(tileClaims.x, minX),
        lte(tileClaims.x, maxX),
        gte(tileClaims.y, minY),
        lte(tileClaims.y, maxY),
      ),
    );

  const nearbyPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      x: players.x,
      y: players.y,
    })
    .from(players)
    .where(
      and(
        ne(players.id, playerId),
        sql`${players.x} BETWEEN ${minX} AND ${maxX}`,
        sql`${players.y} BETWEEN ${minY} AND ${maxY}`,
      ),
    );

  const buildingByPos = new Map(
    overlayBuildings.map((b) => [`${b.x},${b.y}`, b]),
  );
  const claimByPos = new Map(claims.map((c) => [`${c.x},${c.y}`, c]));

  const tiles = [];
  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inVision = dx * dx + dy * dy <= r2;
      const wasExplored = explored.has(`${x},${y}`);
      if (!inVision && !wasExplored) {
        tiles.push({
          x,
          y,
          fog: true as const,
        });
        continue;
      }
      const gen = generateTile(x, y, WORLD_SEED);
      const b = buildingByPos.get(`${x},${y}`);
      const c = claimByPos.get(`${x},${y}`);
      tiles.push({
        x,
        y,
        fog: false as const,
        inVision,
        explored: wasExplored || inVision,
        isLand: gen.isLand,
        terrain: gen.terrain,
        resourceType: gen.resourceType,
        building: b
          ? {
              id: b.id,
              type: b.type,
              ownerId: b.ownerId,
              level: b.level,
              message: b.message,
            }
          : null,
        claim: c
          ? { ownerId: c.ownerId, askingPrice: c.askingPrice }
          : null,
      });
    }
  }

  const visibleOthers = nearbyPlayers.filter((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return dx * dx + dy * dy <= r2;
  });

  return NextResponse.json({
    center: { x: cx, y: cy },
    player: { x: me.x, y: me.y, name: me.name, id: me.id },
    visionRadius: r,
    tiles,
    players: visibleOthers,
  });
  } catch (err) {
    console.error("[api/map/viewport]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
