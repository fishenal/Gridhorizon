import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players, tradeOffers } from "@/lib/db/schema";
import { settlePlayer } from "@/lib/game/settle";
import { ensureFriendship } from "@/lib/game/social";

const createSchema = z.object({
  action: z.literal("create"),
  toPlayerId: z.number().int(),
  kind: z.enum(["sell", "buy"]),
  resource: z.enum(["stone", "wood", "ore", "food", "gold"]),
  amount: z.number().int().positive(),
  priceGold: z.number().int().nonnegative(),
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
  const offers = await db
    .select()
    .from(tradeOffers)
    .where(
      and(
        eq(tradeOffers.status, "open"),
        or(
          eq(tradeOffers.fromPlayerId, playerId),
          eq(tradeOffers.toPlayerId, playerId),
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
  await settlePlayer(db, playerId);

  if (json.action === "create") {
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const data = parsed.data;
    if (data.toPlayerId === playerId) {
      return NextResponse.json({ error: "Cannot trade with self" }, { status: 400 });
    }
    await ensureFriendship(db, playerId, data.toPlayerId);
    await db.insert(tradeOffers).values({
      fromPlayerId: playerId,
      toPlayerId: data.toPlayerId,
      kind: data.kind,
      resource: data.resource,
      amount: data.amount,
      priceGold: data.priceGold,
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = respondSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const offer = await db.query.tradeOffers.findFirst({
    where: eq(tradeOffers.id, parsed.data.offerId),
  });
  if (!offer || offer.status !== "open") {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  if (parsed.data.action === "cancel") {
    if (offer.fromPlayerId !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db
      .update(tradeOffers)
      .set({ status: "cancelled" })
      .where(eq(tradeOffers.id, offer.id));
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "reject") {
    if (offer.toPlayerId !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db
      .update(tradeOffers)
      .set({ status: "rejected" })
      .where(eq(tradeOffers.id, offer.id));
    return NextResponse.json({ ok: true });
  }

  // accept
  if (offer.toPlayerId !== playerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = await db.query.players.findFirst({
    where: eq(players.id, offer.fromPlayerId),
  });
  const to = await db.query.players.findFirst({
    where: eq(players.id, offer.toPlayerId),
  });
  if (!from || !to) {
    return NextResponse.json({ error: "Players missing" }, { status: 400 });
  }

  const resKey = offer.resource as
    | "stone"
    | "wood"
    | "ore"
    | "food"
    | "gold";

  if (offer.kind === "sell") {
    // from sells resource to `to` for gold
    if (from[resKey] < offer.amount || to.gold < offer.priceGold) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }
    await db
      .update(players)
      .set({
        [resKey]: from[resKey] - offer.amount,
        gold: from.gold + offer.priceGold,
      })
      .where(eq(players.id, from.id));
    await db
      .update(players)
      .set({
        [resKey]: to[resKey] + offer.amount,
        gold: to.gold - offer.priceGold,
      })
      .where(eq(players.id, to.id));
  } else {
    // from buys resource from `to`
    if (to[resKey] < offer.amount || from.gold < offer.priceGold) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }
    await db
      .update(players)
      .set({
        [resKey]: from[resKey] + offer.amount,
        gold: from.gold - offer.priceGold,
      })
      .where(eq(players.id, from.id));
    await db
      .update(players)
      .set({
        [resKey]: to[resKey] - offer.amount,
        gold: to.gold + offer.priceGold,
      })
      .where(eq(players.id, to.id));
  }

  await db
    .update(tradeOffers)
    .set({ status: "accepted" })
    .where(eq(tradeOffers.id, offer.id));

  return NextResponse.json({ ok: true });
}
