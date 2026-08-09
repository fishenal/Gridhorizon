import Ably from "ably";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { mapChannelName } from "@/lib/ably/channels";
import { ensureDefaultMap, getPlayerWorld } from "@/lib/map/world";

export async function GET() {
  try {
    const apiKey = process.env.ABLY_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Ably not configured" },
        { status: 503 },
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    if (!Number.isFinite(playerId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await ensureDefaultMap(db);
    const player = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    if (!player) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const world = await getPlayerWorld(db, playerId);
    const channel = mapChannelName(world.id);

    const rest = new Ably.Rest({ key: apiKey });
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: String(playerId),
      capability: {
        [channel]: ["subscribe", "publish", "presence"],
      },
    });

    return NextResponse.json(tokenRequest);
  } catch (err) {
    console.error("[api/ably/token]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
