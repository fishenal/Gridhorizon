import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, players } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { logBuild } from "@/lib/game/activityLog";
import {
  applyBuildWallet,
  getBuildAvailability,
  getBuildEntry,
  type BuildKind,
} from "@/lib/game/buildCatalog";
import { BUILDING_NAME_MAX } from "@/lib/game/buildingName";
import { FLAG_RANGE_RADIUS } from "@/lib/game/playerStyle";
import { FLAG_TOLL, TOWN_TOLL } from "@/lib/map/constants";
import { addXp, XP_BUILD } from "@/lib/game/xp";
import { generateTile } from "@/lib/map/generator";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

const bodySchema = z.object({
  action: z.enum([
    "mine",
    "farm",
    "lumber",
    "town",
    "flag",
    "waypoint",
  ]),
  x: z.number().int(),
  y: z.number().int(),
  name: z.string().trim().min(1).max(BUILDING_NAME_MAX).optional(),
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

  let { action, x, y, name, message } = parsed.data;
  if (action === "waypoint") action = "flag";
  const kind = action as BuildKind;

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

  const gate = getBuildAvailability(kind, {
    isLand: tile.isLand,
    occupied: Boolean(existingBuilding),
    gold: player.gold,
    stone: player.stone,
    wood: player.wood,
    food: player.food,
    population: player.ore,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.reason ?? "Cannot build" },
      { status: 400 },
    );
  }

  const entry = getBuildEntry(kind);
  const buildName = (name ?? message ?? "").trim();
  if (entry.needsName && (buildName.length < 1 || buildName.length > BUILDING_NAME_MAX)) {
    return NextResponse.json(
      { error: `Name required (1–${BUILDING_NAME_MAX} chars)` },
      { status: 400 },
    );
  }

  const next = applyBuildWallet(
    {
      gold: player.gold,
      stone: player.stone,
      wood: player.wood,
      food: player.food,
      population: player.ore,
    },
    kind,
  );

  await db
    .update(players)
    .set({
      gold: next.gold,
      stone: next.stone,
      wood: next.wood,
      food: next.food,
      ore: next.population,
    })
    .where(eq(players.id, playerId));

  const named = entry.needsName ? buildName : null;
  const [row] = await db
    .insert(buildings)
    .values({
      mapId,
      x,
      y,
      ownerId: playerId,
      type: kind,
      name: named,
      message: named,
      tollRadius:
        kind === "flag" ||
        kind === "town" ||
        kind === "mine" ||
        kind === "farm" ||
        kind === "lumber"
          ? FLAG_RANGE_RADIUS
          : null,
      tollAmount:
        kind === "town" ? TOWN_TOLL : kind === "flag" ? FLAG_TOLL : null,
    })
    .returning({ id: buildings.id });

  await addXp(db, playerId, XP_BUILD);
  await logBuild(db, playerId, mapId, {
    buildingType: kind,
    name: named,
    x,
    y,
    buildingId: row?.id,
  });
  return NextResponse.json({
    ok: true,
    wallet: next,
  });
}
