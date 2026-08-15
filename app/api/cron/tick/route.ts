import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { settleEconomyForAll } from "@/lib/game/economy";
import { settleOutstandingTravel } from "@/lib/game/travel";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const travelsSettled = await settleOutstandingTravel(db);
  const economyCount = await settleEconomyForAll(db);

  return NextResponse.json({
    ok: true,
    travelsSettled,
    economyPlayers: economyCount,
  });
}
