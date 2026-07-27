import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players, tileClaims } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { MINE_COST, WAYPOINT_COST } from "@/lib/map/constants";
import { generateTile } from "@/lib/map/generator";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

const bodySchema = z.object({
  action: z.enum([
    "claim",
    "mine",
    "farm",
    "fishery",
    "town",
    "waypoint",
  ]),
  x: z.number().int(),
  y: z.number().int(),
  message: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const playerId = Number(session.user.id);
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, x, y, message } = parsed.data;
  const db = getDb();
  await ensureDefaultMap(db);
  await settlePlayer(db, playerId);

  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const world = await getPlayerWorld(db, playerId);
  const mapId = world.id;

  if (player.x !== x || player.y !== y) {
    return NextResponse.json(
      { error: "Must be standing on the tile" },
      { status: 400 },
    );
  }

  const tile = generateTile(x, y, world.seed);
  const existingBuilding = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.mapId, mapId),
      eq(buildings.x, x),
      eq(buildings.y, y),
    ),
  });
  const existingClaim = await db.query.tileClaims.findFirst({
    where: and(
      eq(tileClaims.mapId, mapId),
      eq(tileClaims.x, x),
      eq(tileClaims.y, y),
    ),
  });

  if (action === "claim") {
    if (!tile.isLand) {
      return NextResponse.json(
        { error: "Ocean cannot be claimed" },
        { status: 400 },
      );
    }
    if (existingClaim) {
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });
    }
    await db.insert(tileClaims).values({ mapId, x, y, ownerId: playerId });
    return NextResponse.json({ ok: true });
  }

  if (action === "waypoint") {
    if (existingBuilding) {
      return NextResponse.json({ error: "Tile occupied" }, { status: 400 });
    }
    if (player.gold < WAYPOINT_COST) {
      return NextResponse.json({ error: "Need 100 gold" }, { status: 400 });
    }
    await db
      .update(players)
      .set({ gold: player.gold - WAYPOINT_COST })
      .where(eq(players.id, playerId));
    await db.insert(buildings).values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: "waypoint",
      message: message ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (!tile.isLand) {
    return NextResponse.json({ error: "Need land" }, { status: 400 });
  }
  if (!existingClaim || existingClaim.ownerId !== playerId) {
    return NextResponse.json(
      { error: "Claim the tile first" },
      { status: 400 },
    );
  }
  if (existingBuilding) {
    return NextResponse.json({ error: "Tile occupied" }, { status: 400 });
  }

  if (action === "mine") {
    if (tile.resourceType === "none") {
      return NextResponse.json({ error: "No resource here" }, { status: 400 });
    }
    if (player.gold < MINE_COST) {
      return NextResponse.json({ error: "Need 500 gold" }, { status: 400 });
    }
    await db
      .update(players)
      .set({ gold: player.gold - MINE_COST })
      .where(eq(players.id, playerId));
    await db.insert(buildings).values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: "mine",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "farm") {
    if (tile.terrain !== "plain") {
      return NextResponse.json({ error: "Farms need plains" }, { status: 400 });
    }
    if (tile.resourceType !== "none") {
      return NextResponse.json(
        { error: "Resource tiles use mines" },
        { status: 400 },
      );
    }
    await db.insert(buildings).values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: "farm",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "fishery") {
    if (tile.terrain !== "coast") {
      return NextResponse.json(
        { error: "Fisheries need coastal tiles" },
        { status: 400 },
      );
    }
    await db.insert(buildings).values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: "fishery",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "town") {
    if (tile.resourceType !== "none") {
      return NextResponse.json(
        { error: "Towns need non-resource tiles" },
        { status: 400 },
      );
    }
    await db.insert(buildings).values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: "town",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
