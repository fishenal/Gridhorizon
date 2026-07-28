import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players, tileClaims } from "@/lib/db/schema";
import {
  FLAG_RANGE_RADIUS,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import { VISION_RADIUS } from "@/lib/map/constants";
import { loadExploredSet } from "@/lib/map/explore";
import { generateTile } from "@/lib/map/generator";
import { getPlayerWorld } from "@/lib/map/world";

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
    const mapId = world.id;

    const url = new URL(req.url);
    const cx = Number(url.searchParams.get("x") ?? me.x);
    const cy = Number(url.searchParams.get("y") ?? me.y);
    const visionR = VISION_RADIUS;
    const rawView = Number(url.searchParams.get("viewR") ?? visionR);
    const viewR = Math.max(
      visionR,
      Math.min(
        MAX_VIEW_RADIUS,
        Number.isFinite(rawView) ? Math.floor(rawView) : visionR,
      ),
    );

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return NextResponse.json({ error: "Invalid coords" }, { status: 400 });
    }

    const minX = cx - viewR;
    const maxX = cx + viewR;
    const minY = cy - viewR;
    const maxY = cy + viewR;

    const explored = await loadExploredSet(
      db,
      playerId,
      minX,
      minY,
      maxX,
      maxY,
      mapId,
    );

    const overlayBuildings = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.mapId, mapId),
          gte(buildings.x, minX),
          lte(buildings.x, maxX),
          gte(buildings.y, minY),
          lte(buildings.y, maxY),
        ),
      );

    const ownerIds = [...new Set(overlayBuildings.map((b) => b.ownerId))];
    const ownerRows =
      ownerIds.length === 0
        ? []
        : await db
            .select({
              id: players.id,
              name: players.name,
              emoji: players.emoji,
            })
            .from(players)
            .where(inArray(players.id, ownerIds));
    const ownerById = new Map(ownerRows.map((o) => [o.id, o]));

    const claims = await db
      .select()
      .from(tileClaims)
      .where(
        and(
          eq(tileClaims.mapId, mapId),
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
        emoji: players.emoji,
        x: players.x,
        y: players.y,
      })
      .from(players)
      .where(
        and(
          ne(players.id, playerId),
          eq(players.currentMapId, mapId),
          sql`${players.x} BETWEEN ${minX} AND ${maxX}`,
          sql`${players.y} BETWEEN ${minY} AND ${maxY}`,
        ),
      );

    const buildingByPos = new Map(
      overlayBuildings.map((b) => [`${b.x},${b.y}`, b]),
    );
    const claimByPos = new Map(claims.map((c) => [`${c.x},${c.y}`, c]));

    const tiles = [];
    const visionR2 = visionR * visionR;
    // Sparse when view > vision: skip pure fog stubs (client rebuilds fog locally)
    const sparse = viewR > visionR;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const inVision = dx * dx + dy * dy <= visionR2;
        const wasExplored = explored.has(`${x},${y}`);
        if (!inVision && !wasExplored) {
          if (!sparse) {
            tiles.push({
              x,
              y,
              fog: true as const,
            });
          }
          continue;
        }
        const gen = generateTile(x, y, world.seed);
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
                ownerName: ownerById.get(b.ownerId)?.name ?? `#${b.ownerId}`,
                ownerEmoji: normalizePlayerEmoji(
                  ownerById.get(b.ownerId)?.emoji,
                ),
                level: b.level,
                name: b.name,
                message: b.message,
                createdAt: b.createdAt.toISOString(),
                tollRadius:
                  b.tollRadius ??
                  (b.type === "flag" || b.type === "waypoint"
                    ? FLAG_RANGE_RADIUS
                    : null),
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
      return dx * dx + dy * dy <= visionR2;
    });

    return NextResponse.json({
      center: { x: cx, y: cy },
      player: {
        x: me.x,
        y: me.y,
        name: me.name,
        id: me.id,
        emoji: normalizePlayerEmoji(me.emoji),
      },
      visionRadius: visionR,
      viewRadius: viewR,
      mapId,
      tiles,
      players: visibleOthers.map((p) => ({
        ...p,
        emoji: normalizePlayerEmoji(p.emoji),
      })),
    });
  } catch (err) {
    console.error("[api/map/viewport]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
