import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildings, landOffers, players, tileClaims } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

const createSchema = z.object({
  action: z.literal("create"),
  toPlayerId: z.number().int(),
  x: z.number().int(),
  y: z.number().int(),
  priceGold: z.number().int().positive(),
});

const respondSchema = z.object({
  action: z.enum(["accept", "reject", "cancel"]),
  offerId: z.number().int(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const playerId = Number(session.user.id);
  const db = getDb();
  await ensureDefaultMap(db);
  const world = await getPlayerWorld(db, playerId);
  const offers = await db
    .select()
    .from(landOffers)
    .where(
      and(
        eq(landOffers.mapId, world.id),
        eq(landOffers.status, "open"),
        or(
          eq(landOffers.fromPlayerId, playerId),
          eq(landOffers.toPlayerId, playerId),
        ),
      ),
    );
  return NextResponse.json({ offers });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const playerId = Number(session.user.id);
  const json = await req.json();
  const db = getDb();
  await ensureDefaultMap(db);
  await settlePlayer(db, playerId);
  const world = await getPlayerWorld(db, playerId);
  const mapId = world.id;

  if (json.action === "create") {
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { toPlayerId, x, y, priceGold } = parsed.data;
    const claim = await db.query.tileClaims.findFirst({
      where: and(
        eq(tileClaims.mapId, mapId),
        eq(tileClaims.x, x),
        eq(tileClaims.y, y),
      ),
    });
    if (!claim || claim.ownerId !== toPlayerId) {
      return NextResponse.json(
        { error: "Target does not own this tile" },
        { status: 400 },
      );
    }
    if (toPlayerId === playerId) {
      return NextResponse.json(
        { error: "Cannot buy own land" },
        { status: 400 },
      );
    }
    await db.insert(landOffers).values({
      mapId,
      fromPlayerId: playerId,
      toPlayerId,
      x,
      y,
      priceGold,
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = respondSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const offer = await db.query.landOffers.findFirst({
    where: eq(landOffers.id, parsed.data.offerId),
  });
  if (!offer || offer.status !== "open") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "cancel") {
    if (offer.fromPlayerId !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db
      .update(landOffers)
      .set({ status: "cancelled" })
      .where(eq(landOffers.id, offer.id));
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "reject") {
    if (offer.toPlayerId !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db
      .update(landOffers)
      .set({ status: "rejected" })
      .where(eq(landOffers.id, offer.id));
    return NextResponse.json({ ok: true });
  }

  if (offer.toPlayerId !== playerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buyer = await db.query.players.findFirst({
    where: eq(players.id, offer.fromPlayerId),
  });
  const seller = await db.query.players.findFirst({
    where: eq(players.id, offer.toPlayerId),
  });
  if (!buyer || !seller) {
    return NextResponse.json({ error: "Players missing" }, { status: 400 });
  }
  if (buyer.gold < offer.priceGold) {
    return NextResponse.json({ error: "Buyer lacks gold" }, { status: 400 });
  }

  const offerMapId = offer.mapId;
  const claim = await db.query.tileClaims.findFirst({
    where: and(
      eq(tileClaims.mapId, offerMapId),
      eq(tileClaims.x, offer.x),
      eq(tileClaims.y, offer.y),
    ),
  });
  if (!claim || claim.ownerId !== seller.id) {
    return NextResponse.json({ error: "Claim mismatch" }, { status: 400 });
  }

  await db
    .update(players)
    .set({ gold: buyer.gold - offer.priceGold })
    .where(eq(players.id, buyer.id));
  await db
    .update(players)
    .set({ gold: seller.gold + offer.priceGold })
    .where(eq(players.id, seller.id));
  await db
    .update(tileClaims)
    .set({ ownerId: buyer.id, askingPrice: null })
    .where(eq(tileClaims.id, claim.id));
  await db
    .update(buildings)
    .set({ ownerId: buyer.id })
    .where(
      and(
        eq(buildings.mapId, offerMapId),
        eq(buildings.x, offer.x),
        eq(buildings.y, offer.y),
      ),
    );
  await db
    .update(landOffers)
    .set({ status: "accepted" })
    .where(eq(landOffers.id, offer.id));

  return NextResponse.json({ ok: true });
}
